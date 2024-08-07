import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import User from "../../../models/User.js";
import VerificationCode from "../../../models/VerificationCode.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { validateData, zPhone } from "../../../utilities/validation.js";
import logger from "../../services/logger/index.js";

const body = z.object({
  phone: zPhone,
  code: z.string().length(5, "Code must be 5 characters long"),
});

type Body = z.infer<typeof body>;

export const verifyPhoneValidation = validateData({
  body: body,
});

export async function verifyPhone(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { phone, code } = req.body as Body;

    if (authUser.phone?.number && authUser.phone?.verified) {
      throw createError(
        "Phone number already verified",
        StatusCodes.BAD_REQUEST,
      );
    }

    const verificationCode = await VerificationCode.findOne({
      _id: `phone|${phone}`,
    }).orFail(
      createError("Requested phone number not found", StatusCodes.NOT_FOUND),
    );

    if (verificationCode.code !== code) {
      if (!verificationCode.history.some((h) => h.code === code)) {
        throw createError("Invalid code", StatusCodes.BAD_REQUEST);
      }
      logger.warn("Used history code for verification");
    }

    await Promise.all([
      verificationCode.deleteOne(),
      User.findByIdAndUpdate(authUser._id, {
        phone: {
          number: phone,
          verified: true,
        },
      }),
    ]);

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}
