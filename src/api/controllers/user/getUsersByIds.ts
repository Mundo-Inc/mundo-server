import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import type { UserProjectionEssentials } from "@/api/dto/user.js";
import UserProjection from "@/api/dto/user.js";
import User from "@/models/User.js";
import { validateData, zObjectId } from "@/utilities/validation.js";

const getUsersByIdsBody = z.object({
  ids: z.array(zObjectId).min(1),
});

type GetUsersByIdsBody = z.infer<typeof getUsersByIdsBody>;

export const getUsersByIdsValidation = validateData({
  body: getUsersByIdsBody,
});

export async function getUsersByIds(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { ids } = req.body as GetUsersByIdsBody;

    const users = await User.aggregate<UserProjectionEssentials>([
      {
        $match: {
          _id: {
            $in: ids,
          },
        },
      },
      {
        $project: UserProjection.essentials,
      },
    ]);

    res.status(StatusCodes.OK).json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
}
