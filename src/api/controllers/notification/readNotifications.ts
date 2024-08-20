import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import Notification from "../../../models/notification.js";
import { validateData } from "../../../utilities/validation.js";

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
  next: NextFunction,
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
      },
    );

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}
