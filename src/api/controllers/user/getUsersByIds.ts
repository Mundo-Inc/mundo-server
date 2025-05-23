import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import {
  type UserProjectionType,
  UserProjection,
} from "../../../api/dto/user.js";
import User from "../../../models/user/user.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

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
  next: NextFunction,
) {
  try {
    const { ids } = req.body as GetUsersByIdsBody;

    const users = await User.aggregate<UserProjectionType["essentials"]>([
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

    res.status(StatusCodes.OK).json(createResponse(users));
  } catch (err) {
    next(err);
  }
}
