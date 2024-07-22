import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import UserProjection from "../../../api/dto/user.js";
import Comment from "../../../models/Comment.js";
import strings, { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const params = z.object({
  id: zObjectId,
});

type Params = z.infer<typeof params>;

export const deleteCommentLikeValidation = validateData({
  params: params,
});

export async function deleteCommentLike(
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

    if (!comment.likes.some((l) => authUser._id.equals(l))) {
      throw createError(strings.comments.notLiked, StatusCodes.BAD_REQUEST);
    }

    comment.likes = comment.likes.filter((l) => !authUser._id.equals(l));

    await comment.save();

    await comment.populate({
      path: "author",
      select: UserProjection.essentials,
    });

    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        _id: comment._id,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        content: comment.content,
        mentions: comment.mentions,
        author: comment.author,
        likes: comment.likes.length,
        liked: false,
      },
    });
  } catch (err) {
    next(err);
  }
}
