import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import { UserProjection } from "../../../api/dto/user.js";
import Comment from "../../../models/comment.js";
import strings, { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const params = z.object({
  id: zObjectId,
});

type Params = z.infer<typeof params>;

export const likeCommentValidation = validateData({
  params: params,
});

export async function likeComment(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { id } = req.params as unknown as Params;

    const comment = await Comment.findById(id).orFail(
      createError(
        dynamicMessage(ds.notFound, "Comment"),
        StatusCodes.NOT_FOUND,
      ),
    );

    if (comment.likes.find((l) => authUser._id.equals(l))) {
      throw createError(strings.comments.alreadyLiked, StatusCodes.CONFLICT);
    }

    comment.likes.push(authUser._id);
    await comment.save();

    await comment.populate({
      path: "author",
      select: UserProjection.essentials,
    });

    res.status(StatusCodes.OK).json(
      createResponse({
        _id: comment._id,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        content: comment.content,
        mentions: comment.mentions,
        author: comment.author,
        likes: comment.likes.length,
        liked: true,
      }),
    );
  } catch (err) {
    next(err);
  }
}
