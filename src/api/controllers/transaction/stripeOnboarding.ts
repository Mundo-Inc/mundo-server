import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import User from "@/models/User.js";
import { dStrings as ds, dynamicMessage } from "@/strings.js";
import { createError } from "@/utilities/errorHandlers.js";
import stripe from "./stripe.js";

export async function stripeOnboarding(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = req.user!;

    let user = await User.findById(authUser._id).orFail(
      createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND)
    );

    const accountId = user.stripe.connectAccountId;

    if (!accountId) {
      throw createError(
        "Payout-method is not set up for this account, try setting that up first before onboarding",
        StatusCodes.BAD_REQUEST
      );
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: "https://www.phantomphood.ai", // URL to redirect if the link is no longer valid
      return_url: "https://www.phantomphood.ai", // URL to redirect after the user completes the onboarding
      type: "account_onboarding",
    });

    res
      .status(StatusCodes.OK)
      .json({ success: true, data: { url: accountLink.url } });
  } catch (error) {
    next(error);
  }
}
