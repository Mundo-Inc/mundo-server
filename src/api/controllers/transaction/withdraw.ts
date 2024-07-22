import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import User from "../../../models/User.js";
import Withdrawal from "../../../models/Withdrawal.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { ensureNonEmptyString } from "../../../utilities/requireValue.js";
import { validateData } from "../../../utilities/validation.js";
import stripe from "./stripe.js";

const body = z.object({
  amount: z.number().min(0),
});

type Body = z.infer<typeof body>;

export const withdrawValidation = validateData({
  body: body,
});

export async function withdraw(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { amount: inputAmount } = req.body as unknown as Body;

    const amount = Math.round(inputAmount * 100) / 100; // Ensure amount is rounded to 2 decimal places

    const user = await User.findById(authUser._id).orFail(
      createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND),
    );

    // Ensure the user's balance is sufficient
    if (user.stripe.balance < amount) {
      throw createError("Insufficient Balance", StatusCodes.BAD_REQUEST);
    }

    // Check if the user has a Stripe Connect account with a bank account attached
    const connectAccountId = ensureNonEmptyString(
      user.stripe.connectAccountId,
      createError(
        "Stripe Connect account not configured",
        StatusCodes.BAD_REQUEST,
      ),
    );

    // Retrieve the Stripe Connect account to confirm that it has an external account set up
    try {
      const account = await stripe.accounts.retrieve(connectAccountId);

      if (
        account.requirements &&
        account.requirements.currently_due &&
        account.requirements.eventually_due &&
        (account.requirements.currently_due.length > 0 ||
          account.requirements.eventually_due.length > 0)
      ) {
        throw createError(
          "Please update your account information to be eligible for the withdrawal",
          StatusCodes.BAD_REQUEST,
        );
      }
      // Transfer funds to the Connect account, assuming the platform has enough balance
      await stripe.transfers.create({
        amount: amount * 100, // Amount in cents
        currency: "usd",
        destination: connectAccountId,
      });
    } catch (error) {
      throw createError(
        "Error retrieving Stripe account details:",
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }

    // Create a payout to the default external account
    const payout = await stripe.payouts.create(
      {
        amount: amount * 100, // Convert to cents
        currency: "usd",
      },
      {
        stripeAccount: connectAccountId, // Specify the connected Stripe account to payout from
      },
    );

    // Deduct the payout amount from the user's balance
    user.stripe.balance -= amount;
    await user.save();

    await Withdrawal.create({
      user: authUser._id,
      amount: amount,
      payoutId: payout.id,
    });

    res.status(StatusCodes.OK).json({
      success: true,
      data: payout,
    });
  } catch (error) {
    next(error);
  }
}
