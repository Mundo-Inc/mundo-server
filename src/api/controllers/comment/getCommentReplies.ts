import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import Block from "../../../models/Block.js";
import Comment from "../../../models/Comment.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { getPaginationFromQuery } from "../../../utilities/pagination.js";
import { createResponse } from "../../../utilities/response.js";
import {
  validateData,
  zObjectId,
  zPaginationSpread,
} from "../../../utilities/validation.js";
import { getCommentsFromDB } from "./helpers.js";

const params = z.object({
  id: zObjectId,
});
const query = z.object(zPaginationSpread);

type Params = z.infer<typeof params>;

export const getCommentRepliesValidation = validateData({
  params: params,
  query: query,
});

export async function getCommentReplies(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { id } = req.params as unknown as Params;

    const { page, limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 20,
      maxLimit: 50,
    });

    const comment = await Comment.findById(id).orFail(
      createError(
        dynamicMessage(ds.notFound, "Comment"),
        StatusCodes.NOT_FOUND,
      ),
    );

    if (comment.children.length === 0) {
      return res.status(StatusCodes.OK).json(createResponse([]));
    }

    const blockedUsers = (
      await Block.find({ target: authUser._id }, "user")
    ).map((block) => block.user);

    const result = await getCommentsFromDB(
      {
        _id: { $in: comment.children },
        author: { $nin: blockedUsers },
      },
      undefined,
      authUser._id,
      false,
      skip,
      limit,
    );

    res.status(StatusCodes.OK).json(
      createResponse(result.comments, {
        totalCount: result.count || 0,
        page: page,
        limit: limit,
      }),
    );
  } catch (err) {
    next(err);
  }
}
