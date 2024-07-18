import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import type { Types } from "mongoose";
import { z } from "zod";

import Block from "@/models/Block.js";
import { getPaginationFromQuery } from "@/utilities/pagination.js";
import {
  validateData,
  zObjectId,
  zPaginationSpread,
} from "@/utilities/validation.js";
import { getCommentsFromDB } from "../comment/helpers.js";

const params = z.object({
  activityId: zObjectId,
});
const query = z.object(zPaginationSpread);

type Params = z.infer<typeof params>;

export const getActivityCommentsValidation = validateData({
  params: params,
  query: query,
});

export async function getActivityComments(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = req.user!;

    const { activityId } = req.params as unknown as Params;

    const { page, limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 20,
      maxLimit: 50,
    });

    const blockedUsers = (
      await Block.find({ target: authUser._id }, "user")
    ).map((block) => block.user);

    const result = await getCommentsFromDB(
      {
        userActivity: activityId,
        author: { $nin: blockedUsers },
        rootComment: null,
      },
      {
        createdAt: -1,
      },
      authUser._id,
      true,
      skip,
      limit
    );

    const replyIds: Types.ObjectId[] = [];

    for (const comment of result.comments) {
      replyIds.push(...comment.replies);
    }

    const replies = await getCommentsFromDB(
      {
        _id: { $in: replyIds },
      },
      undefined,
      authUser._id,
      false
    );

    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        comments: result.comments,
        replies: replies.comments,
      },
      pagination: {
        totalCount: result.count || 0,
        page: page,
        limit: limit,
      },
    });
  } catch (err) {
    next(err);
  }
}
