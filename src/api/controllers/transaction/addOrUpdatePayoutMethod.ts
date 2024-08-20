import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import type Stripe from "stripe";

import User from "../../../models/user/user.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import stripe from "./stripe.js";

export async function addOrUpdatePayoutMethod(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const user = await User.findById(authUser._id).orFail(
      createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND),
    );

    let accountId = user.stripe.connectAccountId;

    if (!accountId) {
      // Create a new Custom Stripe Connect account
      const account = await stripe.accounts.create({
        type: "custom",
        email: user.email.address,
        business_type: "individual",
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
      accountId = account.id;
      user.stripe.connectAccountId = accountId;
      await user.save();
    }

    // Retrieve the account to check for required information
    const account: Stripe.Account | null =
      await stripe.accounts.retrieve(accountId);

    if (
      !(
        account.requirements &&
        account.requirements.currently_due &&
        account.requirements.eventually_due
      )
    ) {
      throw createError(
        "Error retrieving account requirements",
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }

    const isEligible =
      account.requirements.currently_due.length === 0 &&
      account.requirements.eventually_due.length === 0;

    // Check if there are any requirements pending that prevent payouts
    res.status(StatusCodes.OK).json(
      createResponse({
        eligible: isEligible,
        message: isEligible
          ? "No additional setup required. Account is fully set up for payouts."
          : "Please complete the required account setup.",
      }),
    );
  } catch (error) {
    next(error);
  }
}
