import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import User, { SignupMethodEnum, UserRoleEnum } from "@/models/User.js";
import { createError } from "@/utilities/errorHandlers.js";
import { validateData, zUsername } from "@/utilities/validation.js";
import { dStrings, dynamicMessage } from "@/strings.js";

const body = z.object({
  email: z.string().email(),
  name: z.string(),
  username: zUsername.optional(),
});

type Body = z.infer<typeof body>;

export const createBotValidation = validateData({
  body: body,
});

export async function createBot(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { name, username, email } = req.body as Body;

    let user = await User.findOne({
      "email.address": email.toLowerCase(),
    });

    if (user) {
      throw createError(
        dynamicMessage(dStrings.alreadyExists, "User"),
        StatusCodes.CONFLICT
      );
    }

    if (username) {
      user = await User.findOne({
        username: username,
      });
      if (user) {
        throw createError(
          dynamicMessage(dStrings.alreadyExists, "User"),
          StatusCodes.CONFLICT
        );
      }
    }
    user = await User.create({
      name,
      username: username || Math.random().toString(36).substring(2, 15),
      email: {
        address: email,
        verified: false,
      },
      role: UserRoleEnum.User,
      signupMethod: SignupMethodEnum.Bot,
      password: null,
    });

    return res.json({
      sucess: true,
      data: {
        user,
      },
    });
  } catch (err) {
    next(err);
  }
}
