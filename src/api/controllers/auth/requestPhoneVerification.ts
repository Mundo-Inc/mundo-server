import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import VerificationCode from "../../../models/VerificationCode.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { validateData, zPhone } from "../../../utilities/validation.js";
import SmsService from "../../services/sms-service.js";

const body = z.object({
  phone: zPhone,
});

type Body = z.infer<typeof body>;

export const requestPhoneVerificationValidation = validateData({
  body: body,
});

export async function requestPhoneVerification(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { phone } = req.body as Body;

    const existingCode = await VerificationCode.findOne({
      _id: `phone|${phone}`,
    });

    let newCode: string;

    if (existingCode) {
      if (existingCode.history.length > 0) {
        // 3+ attempts

        const lastHistory =
          existingCode.history[existingCode.history.length - 1];

        const diffSeconds = Math.floor(
          (Date.now() - lastHistory.date.getTime()) / 1000,
        );

        // At least 1 minute has to pass between requests
        if (diffSeconds < 60) {
          throw createError(
            `Please wait ${
              60 - diffSeconds
            } seconds before requesting a new verification code.`,
            {
              statusCode: StatusCodes.TOO_MANY_REQUESTS,
              type: "Wait a minute",
            },
          );
        }
      }

      existingCode.history.push({
        date: existingCode.updatedAt,
        code: existingCode.code,
      });

      newCode = (Math.floor(Math.random() * 89999) + 10000).toString();

      existingCode.code = newCode;
      existingCode.updatedAt = new Date();

      await existingCode.save();
    } else {
      newCode = (Math.floor(Math.random() * 89999) + 10000).toString();

      await VerificationCode.create({
        _id: `phone|${phone}`,
        code: newCode,
      });
    }

    await SmsService.getInstance().send(
      phone,
      `Mundo\nYour verification code is ${newCode}`,
    );

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}
