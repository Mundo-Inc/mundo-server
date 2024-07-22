import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import UserProjection from "../../../api/dto/user.js";
import List from "../../../models/List.js";
import {
  validateData,
  zUniqueObjectIdArray,
} from "../../../utilities/validation.js";

const body = z.object({
  name: z.string(),
  collaborators: zUniqueObjectIdArray.optional(),
  icon: z.string().optional(),
  isPrivate: z.boolean().optional().default(false),
});

type Body = z.infer<typeof body>;

export const createListValidation = validateData({
  body: body,
});

export async function createList(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { name, collaborators, icon, isPrivate } = req.body as Body;

    const newList = await List.create({
      name,
      owner: authUser._id,
      collaborators,
      icon,
      isPrivate,
    });

    await Promise.all([
      newList.populate("owner", UserProjection.essentials),
      newList.populate("collaborators.user", UserProjection.essentials),
    ]);

    res.status(StatusCodes.CREATED).json({
      success: true,
      data: {
        ...newList.toObject(),
        placesCount: 0,
      },
    });
  } catch (err) {
    next(err);
  }
}
