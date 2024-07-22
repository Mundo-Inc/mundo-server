import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import DeletionService from "../../../api/services/DeletionService.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const params = z.object({
  id: zObjectId,
});

type Params = z.infer<typeof params>;

export const deleteCommentValidation = validateData({
  params: params,
});

export async function deleteComment(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { id } = req.params as unknown as Params;

    await DeletionService.deleteComment(id, (comment) => {
      if (!authUser._id.equals(comment.author)) {
        throw createError(
          "You are not authorized to delete this comment",
          StatusCodes.FORBIDDEN,
        );
      }
    });

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}
