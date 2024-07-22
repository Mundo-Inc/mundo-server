import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import Block from "../../../models/Block.js";
import User from "../../../models/User.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const params = z.object({
  id: zObjectId,
});

type Params = z.infer<typeof params>;

export const blockUserValidation = validateData({
  params: params,
});

export async function blockUser(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { id } = req.params as unknown as Params;

    const exists = await Block.exists({ user: authUser._id, target: id });

    if (exists) {
      throw createError(
        dynamicMessage(ds.alreadyExists, "Document"),
        StatusCodes.CONFLICT,
      );
    }

    await User.exists({ _id: id }).orFail(
      createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND),
    );

    await Block.create({
      user: authUser._id,
      target: id,
    });

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}
