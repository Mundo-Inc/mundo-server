import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import User from "../../../models/user/user.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData } from "../../../utilities/validation.js";
import { createStripeCustomer } from "./helpers.js";
import stripe from "./stripe.js";

const body = z.object({
  paymentMethodId: z.string(),
});

type Body = z.infer<typeof body>;

export const addOrUpdatePaymentMethodValidation = validateData({
  body: body,
});

export async function addOrUpdatePaymentMethod(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { paymentMethodId } = req.body as unknown as Body;

    const user = await User.findById(authUser._id).orFail(
      createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND),
    );

    if (!user.stripe.defaultPaymentMethodId) {
      // Assuming you have a Stripe Customer ID stored or you create a new Customer
      const customerId =
        user.stripe.customerId || (await createStripeCustomer(user)).id;
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });

      user.stripe.customerId = customerId;
    }

    // Update the user's payment method
    user.stripe.defaultPaymentMethodId = paymentMethodId;
    await user.save();

    res
      .status(StatusCodes.OK)
      .json(createResponse({ paymentMethodId: paymentMethodId }));
  } catch (error) {
    next(error);
  }
}
