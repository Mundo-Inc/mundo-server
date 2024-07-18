import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import User from "@/models/User.js";
import strings from "@/strings.js";
import { createError } from "@/utilities/errorHandlers.js";
import { validateData } from "@/utilities/validation.js";

const usernameAvailabilityParams = z.object({
  username: z.string(),
});

type UsernameAvailabilityParams = z.infer<typeof usernameAvailabilityParams>;

export const usernameAvailabilityValidation = validateData({
  params: usernameAvailabilityParams,
});

export async function usernameAvailability(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = req.user;

    const { username } = req.params as UsernameAvailabilityParams;

    if (!username) {
      throw createError(
        strings.validations.missRequiredFields,
        StatusCodes.BAD_REQUEST
      );
    }

    const usernameRegex = /^[a-zA-Z0-9_]{5,20}$/;
    if (!usernameRegex.test(username as string)) {
      if (username.length < 5) {
        throw createError(
          strings.validations.invalidUsernameLength,
          StatusCodes.BAD_REQUEST
        );
      }
      throw createError(
        strings.validations.invalidUsername,
        StatusCodes.BAD_REQUEST
      );
    }

    let user;
    if (authUser) {
      user = await User.findOne({
        username: {
          $regex: `^${username}$`,
          $options: "i",
        },
        _id: {
          $ne: authUser._id,
        },
      });
    } else {
      user = await User.findOne({
        username: {
          $regex: `^${username}$`,
          $options: "i",
        },
      });
    }

    if (user) {
      throw createError(strings.user.usernameTaken, StatusCodes.CONFLICT);
    }

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}
