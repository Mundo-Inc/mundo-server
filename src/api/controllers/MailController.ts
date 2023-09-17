import type { NextFunction, Request, Response } from "express";
import { body, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import bcrypt from "bcryptjs";
import crypto from "crypto";

import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import validate from "./validators";
import strings, { dStrings as ds, dynamicMessage } from "../../strings";
import User, { SignupMethodEnum } from "../../models/User";
import { BrevoService } from "../services/brevo.service";

export const resetPasswordValidation: ValidationChain[] = [
  validate.email(body("email")),
  body("action")
    .isIn(["generate", "update"])
    .withMessage(strings.server.invalidAction),
];
export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { action, email } = req.body;
    if (action === "generate") {
      const user = await User.findOne({
        "email.address": {
          $regex: new RegExp(email, "i"),
        },
      });

      if (!user) {
        return res.status(StatusCodes.OK).json({
          success: true,
          message: strings.mail.resetPassEmailSent,
        });
      }

      if (user.signupMethod === SignupMethodEnum.social) {
        throw createError(
          strings.mail.resetPassNotProvidedForSocialMethods,
          StatusCodes.BAD_REQUEST
        );
      }

      // Generate a password reset token
      const resetPasswordToken = crypto.randomBytes(20).toString("hex");

      // Set token and expiry date on the user document
      const tokenExpiryDate = Date.now() + 3600000; // 1 hour from now
      if (
        // if 1 minute has not passed since the last email
        user.token.resetPasswordTokenExpiry &&
        user.token.resetPasswordTokenExpiry.getTime() - 3540000 > Date.now()
      ) {
        throw createError(
          strings.mail.resetPasswordWaiting,
          StatusCodes.TOO_MANY_REQUESTS
        );
      }

      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            "token.resetPasswordToken": resetPasswordToken,
            "token.resetPasswordTokenExpiry": tokenExpiryDate,
          },
        }
      );

      const receivers = [{ email: user.email.address }];
      const sender = { email: "admin@phantomphood.com", name: "Phantom Phood" };
      const subject = "PhantomPhood - Reset Password";
      const url = `${process.env.URL}/reset-password/newPassword/${user.email.address}/${resetPasswordToken}`;
      const brevoService = new BrevoService();
      await brevoService.sendTemplateEmail(
        receivers,
        subject,
        sender,
        "reset-password-email.handlebars",
        {
          url,
        }
      );

      res
        .status(StatusCodes.OK)
        .json({ success: true, data: strings.mail.resetPassEmailSent });
    } else if (action === "update") {
      // to update the password
      const { newPassword, resetPasswordToken, email } = req.body;
      const user = await User.findOne({
        "email.address": {
          $regex: new RegExp(email, "i"),
        },
      });

      if (!user || !user.token.resetPasswordToken) {
        throw createError(
          strings.mail.userNotRequestedResetPassword,
          StatusCodes.BAD_REQUEST
        );
      }

      if (user.signupMethod === SignupMethodEnum.social) {
        throw createError(
          strings.mail.resetPassNotProvidedForSocialMethods,
          StatusCodes.BAD_REQUEST
        );
      }

      if (
        !user.token.resetPasswordTokenExpiry ||
        Date.now() > user.token.resetPasswordTokenExpiry.getTime()
      ) {
        throw createError(
          strings.mail.resetPassLinkInvalid,
          StatusCodes.BAD_REQUEST
        );
      }

      if (resetPasswordToken !== user.token.resetPasswordToken) {
        throw createError(strings.mail.tokenIsInvalid, StatusCodes.BAD_REQUEST);
      }

      const isPasswordTheSame = await bcrypt.compare(
        newPassword,
        user.password
      );
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      if (isPasswordTheSame) {
        throw createError(
          strings.mail.sameAsPreviousPassword,
          StatusCodes.BAD_REQUEST
        );
      }

      user.password = hashedPassword;
      user.token.resetPasswordToken = undefined;
      user.token.resetPasswordTokenExpiry = undefined;
      await user.save();

      res.json({ success: true, message: strings.mail.passwordReset });
    }
  } catch (err) {
    next(err);
  }
}

/**
 * required auth
 */
export async function sendEmailVerification(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: authId } = req.user!;

    const user = await User.findById(authId);

    if (!user) {
      throw createError(
        dynamicMessage(ds.notFound, "User"),
        StatusCodes.NOT_FOUND
      );
    }

    if (user.email.verified) {
      throw createError(strings.mail.alreadyVerified, StatusCodes.BAD_REQUEST);
    }

    const now = new Date();
    // Check if it's been more than 30 minutes since the last email was sent
    if (
      user.token.lastEmailSent &&
      now.getTime() - user.token.lastEmailSent.getTime() < 30 * 60 * 1000
    ) {
      throw createError(
        strings.mail.verificationWaiting,
        StatusCodes.TOO_MANY_REQUESTS
      );
    }

    const verificationToken = crypto.randomBytes(20).toString("hex");
    await User.updateOne(
      { _id: authId },
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
    const verifyLink = `${process.env.NEXT_PUBLIC_APP_ENDPOINT}/verify?token=${verificationToken}`;
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

/**
 * required auth
 */
export const verifyEmailValidation: ValidationChain[] = [
  query("token").notEmpty().withMessage(strings.mail.tokenIsRequired),
];
export async function verifyEmail(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: authId } = req.user!;
    const { token } = req.query;

    const user = await User.findById(authId);
    if (!user) {
      throw createError(strings.user.notFound, StatusCodes.NOT_FOUND);
    }

    if (user.email.verified) {
      throw createError(strings.mail.alreadyVerified, StatusCodes.BAD_REQUEST);
    }

    const now = new Date();
    // Check if the token has expired
    if (user.token.emailTokenExpiry.getTime() < now.getTime()) {
      throw createError(
        strings.mail.verifyLinkExpired,
        StatusCodes.BAD_REQUEST
      );
    }

    if (token === user.token.verificationToken) {
      await User.updateOne(
        { _id: authId },
        { $set: { "email.verified": true } }
      );
      res.status(StatusCodes.OK).json({ message: strings.mail.emailVerified });
    } else {
      throw createError(strings.mail.invalidToken, StatusCodes.BAD_REQUEST);
    }
  } catch (err) {
    next(err);
  }
}
