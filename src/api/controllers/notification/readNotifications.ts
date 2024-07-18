import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import { validateData, zObjectId } from "@/utilities/validation.js";
import { dStrings as ds, dynamicMessage } from "@/strings.js";
import { createError } from "@/utilities/errorHandlers.js";
import Notification from "@/models/Notification.js";

const body = z.object({
  date: z
    .number()
    .int()
    .transform((value) => new Date(value)),
});

type Body = z.infer<typeof body>;

export const readNotificationsValidation = validateData({
  body: body,
});

export async function readNotifications(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = req.user!;

    const { date } = req.body as Body;

    await Notification.updateMany(
      {
        user: authUser._id,
        readAt: null,
        createdAt: {
          $lte: date,
        },
      },
      {
        readAt: date,
      }
    );

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}
