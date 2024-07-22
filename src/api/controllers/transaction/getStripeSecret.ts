import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { env } from "../../../env.js";
import User from "../../../models/User.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createStripeCustomer } from "./helpers.js";
import stripe from "./stripe.js";

export async function getStripeSecret(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const user = await User.findById(authUser._id).orFail(
      createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND),
    );

    const customerId =
      user.stripe.customerId || (await createStripeCustomer(user)).id;
    user.stripe.customerId = customerId;

    await user.save();

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: env.STRIPE_API_VERSION },
    );

    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        customer: customerId,
        ephemeralKeySecret: ephemeralKey.secret,
      },
    });
  } catch (error) {
    next(error);
  }
}
