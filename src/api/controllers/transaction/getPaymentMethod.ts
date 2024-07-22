import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import User from "../../../models/User.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import stripe from "./stripe.js";

export async function getPaymentMethod(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const user = await User.findById(authUser._id).orFail(
      createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND),
    );

    if (!user.stripe.defaultPaymentMethodId) {
      throw createError("No payment method found", StatusCodes.NOT_FOUND);
    }

    // Retrieve the payment method details from Stripe
    const paymentMethod = await stripe.paymentMethods.retrieve(
      user.stripe.defaultPaymentMethodId,
    );

    // Extract relevant details to return
    const paymentMethodDetails = {
      type: paymentMethod.type,
      last4: paymentMethod.card?.last4, //TODO: we assumed that it's a card; adjust accordingly for other types
      brand: paymentMethod.card?.brand,
      exp_month: paymentMethod.card?.exp_month,
      exp_year: paymentMethod.card?.exp_year,
    };

    res.status(StatusCodes.OK).json({
      success: true,
      data: paymentMethodDetails,
    });
  } catch (error) {
    next(error);
  }
}
