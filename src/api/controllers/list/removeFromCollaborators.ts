import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import List from "../../../models/list.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const params = z.object({
  listId: zObjectId,
  userId: zObjectId,
});

type Params = z.infer<typeof params>;

export const removeFromCollaboratorsValidation = validateData({
  params: params,
});

export async function removeFromCollaborators(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { listId, userId } = req.params as unknown as Params;

    const list = await List.findById(listId).orFail(
      createError(dynamicMessage(ds.notFound, "List"), StatusCodes.NOT_FOUND),
    );

    if (!authUser._id.equals(list.owner)) {
      throw createError(
        "You're not the owner of this list",
        StatusCodes.FORBIDDEN,
      );
    }

    if (list.owner.equals(userId)) {
      throw createError(
        "you can't remove the owner of the list",
        StatusCodes.BAD_REQUEST,
      );
    }

    if (!list.collaborators.some((c) => c.user.equals(userId))) {
      throw createError(
        dynamicMessage(ds.notFound, "User"),
        StatusCodes.NOT_FOUND,
      );
    }

    list.collaborators = list.collaborators.filter((collaborator) => {
      return !collaborator.user.equals(userId);
    });

    await list.save();

    return res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}
