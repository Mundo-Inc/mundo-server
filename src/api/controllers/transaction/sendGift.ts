import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import Transaction from "../../../models/Transaction.js";
import User from "../../../models/User.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { roundUpToTwoDecimals } from "../../../utilities/numbers.js";
import { ensureNonEmptyString } from "../../../utilities/requireValue.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";
import { sendAttributtedMessage } from "../conversation/helpers.js";
import stripe from "./stripe.js";

const SERVICE_FEE_RATIO = 0.05;

const body = z.object({
  amount: z.number().min(0),
  recipient: zObjectId,
  paymentMethodId: z.string(),
  message: z.string().optional().default(""),
});

type Body = z.infer<typeof body>;

export const sendGiftValidation = validateData({
  body: body,
});

export async function sendGift(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const {
      amount: inputAmount,
      recipient: recipientId,
      paymentMethodId,
      message,
    } = req.body as unknown as Body;

    const amount = Math.round(inputAmount * 100) / 100; // Ensure amount is rounded to 2 decimal places

    if (!recipientId) {
      throw createError("Recipient ID is required", StatusCodes.BAD_REQUEST);
    }

    const [sender, recipient] = await Promise.all([
      User.findById(authUser._id).orFail(
        createError(
          dynamicMessage(ds.notFound, "User (sender)"),
          StatusCodes.NOT_FOUND,
        ),
      ),
      User.findById(recipientId).orFail(
        createError(
          dynamicMessage(ds.notFound, "User (recipient)"),
          StatusCodes.NOT_FOUND,
        ),
      ),
    ]);

    const customerId = ensureNonEmptyString(
      sender.stripe.customerId,
      createError(
        "No customerID found. Please contact support.",
        StatusCodes.BAD_REQUEST,
      ),
    );

    const recipientAccountId = ensureNonEmptyString(
      recipient.stripe.connectAccountId,
      createError(
        "Recipient does not have a Stripe Connect account",
        StatusCodes.BAD_REQUEST,
      ),
    );

    const serviceFee = roundUpToTwoDecimals(amount * SERVICE_FEE_RATIO); // Round up the service fee
    const totalAmount = (amount * 100 + serviceFee * 100) / 100;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount * 100, // Amount in cents
      currency: "usd",
      payment_method: paymentMethodId,
      customer: customerId, // Include the customer ID here
      confirm: true, // Automatically confirm the payment
      description: `Gift transaction from ${sender._id} to ${recipient._id}`,
      transfer_data: {
        destination: recipientAccountId,
      },
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never",
      },
    });

    // Update recipient's balance
    recipient.stripe.balance += amount;
    await recipient.save();

    const transaction = await Transaction.create({
      amount,
      serviceFee,
      totalAmount,
      sender: sender._id,
      recipient: recipient._id,
      paymentIntentId: paymentIntent.id,
      message: message,
    });

    // Send message to recipient
    sendAttributtedMessage(authUser._id, recipientId, message, {
      action: "gift",
      transactionId: transaction._id.toString(),
    });

    res.status(StatusCodes.OK).json(createResponse(transaction));
  } catch (error) {
    next(error);
  }
}
