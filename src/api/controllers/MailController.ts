import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import { query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";

import { env } from "../../env.js";
import User from "../../models/User.js";
import strings, {
  dStrings,
  dStrings as ds,
  dynamicMessage,
} from "../../strings.js";
import {
  createError,
  handleInputErrors,
} from "../../utilities/errorHandlers.js";
import { BrevoService } from "../services/BrevoService.js";

export async function sendEmailVerification(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const user = await User.findById(authUser._id).orFail(
      createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND)
    );

    if (user.email.verified) {
      throw createError(strings.mail.alreadyVerified, StatusCodes.BAD_REQUEST);
    }

    const now = new Date();
    // Check if it's been more than 30 minutes since the last email was sent
    if (
      user.token?.lastEmailSent &&
      now.getTime() - user.token.lastEmailSent.getTime() < 30 * 60 * 1000
    ) {
      throw createError(
        strings.mail.verificationWaiting,
        StatusCodes.TOO_MANY_REQUESTS
      );
    }

    const verificationToken = crypto.randomBytes(20).toString("hex");
    await User.updateOne(
      { _id: authUser._id },
      {
        $set: {
          "token.verificationToken": verificationToken,
          "token.lastEmailSent": now,
          "token.emailTokenExpiry": new Date(
            now.getTime() + 4 * 60 * 60 * 1000
          ),
        },
      }
    );
    const name = user.name;
    const receivers = [{ email: user.email.address }];
    const sender = { email: "admin@phantomphood.com", name: "Phantom Phood" };
    const subject = "PhantomPhood - Email Verification";
    const verifyLink = `${env.WEB_URL}/verify?token=${verificationToken}`;
    const brevoService = new BrevoService();
    await brevoService.sendTemplateEmail(
      receivers,
      subject,
      sender,
      "email-verification.handlebars",
      {
        name,
        verifyLink,
      }
    );
    res
      .status(StatusCodes.OK)
      .json({ success: true, data: strings.mail.verfyEmailSent });
  } catch (err) {
    next(err);
  }
}

export const verifyEmailValidation: ValidationChain[] = [
  query("token")
    .isString()
    .notEmpty()
    .withMessage(strings.mail.tokenIsRequired),
];
export async function verifyEmail(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const token = req.query.token as string;

    const user = await User.findById(authUser._id).orFail(
      createError(
        dynamicMessage(dStrings.notFound, "User"),
        StatusCodes.NOT_FOUND
      )
    );

    if (user.email.verified) {
      throw createError(strings.mail.alreadyVerified, StatusCodes.BAD_REQUEST);
    }

    const now = new Date();

    if (!user.token) {
      throw createError(
        "No email verification token found. Please request a new one.",
        StatusCodes.BAD_REQUEST
      );
    }

    // Check if the token has expired
    if (user.token.emailTokenExpiry.getTime() < now.getTime()) {
      throw createError(
        strings.mail.verifyLinkExpired,
        StatusCodes.BAD_REQUEST
      );
    }

    if (token !== user.token.verificationToken) {
      throw createError(strings.mail.invalidToken, StatusCodes.BAD_REQUEST);
    }

    await User.updateOne(
      { _id: authUser._id },
      { $set: { "email.verified": true } }
    );

    res
      .status(StatusCodes.OK)
      .json({ success: true, message: strings.mail.emailVerified });
  } catch (err) {
    next(err);
  }
}
