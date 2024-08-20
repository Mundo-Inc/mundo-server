import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import Homemade from "../../../models/homemade.js";
import strings, { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const params = z.object({
  id: zObjectId,
});

type Params = z.infer<typeof params>;

export const removeHomemadePostValidation = validateData({
  params: params,
});

export async function removeHomemadePost(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { id } = req.params as unknown as Params;

    const homemade = await Homemade.findById(id).orFail(
      createError(dynamicMessage(ds.notFound, "Post"), StatusCodes.NOT_FOUND),
    );

    if (!authUser._id.equals(homemade.user)) {
      throw createError(strings.authorization.otherUser, StatusCodes.FORBIDDEN);
    }

    await homemade.deleteOne();

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}
