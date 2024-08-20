import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import List from "../../../models/list.js";
import strings, { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const params = z.object({
  listId: zObjectId,
});

type Params = z.infer<typeof params>;

export const deleteListValidation = validateData({
  params: params,
});

export async function deleteList(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { listId } = req.params as unknown as Params;

    const list = await List.findById(listId).orFail(
      createError(dynamicMessage(ds.notFound, "List"), StatusCodes.NOT_FOUND),
    );

    // Check if the reaction belongs to the authenticated user
    if (!authUser._id.equals(list.owner)) {
      throw createError(strings.authorization.userOnly, StatusCodes.FORBIDDEN);
    }

    const deletedList = await list.deleteOne();

    if (deletedList.deletedCount === 0) {
      throw createError(
        "Error deleting the list",
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}
