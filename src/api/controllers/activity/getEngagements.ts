import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import type { Types } from "mongoose";
import { z } from "zod";

import Block from "../../../models/block.js";
import Comment from "../../../models/comment.js";
import Reaction from "../../../models/reaction.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";
import { UserProjection } from "../../dto/user.js";

const params = z.object({
  id: zObjectId,
});
const query = z.object({
  before: z
    .string()
    .transform((val) => new Date(parseInt(val)))
    .optional()
    .default(Date.now().toString()),
  limit: z
    .string()
    .transform((val) => parseInt(val))
    .optional()
    .default("20"),
});

type Params = z.infer<typeof params>;
type Query = z.infer<typeof query>;

export const getEngagementsValidation = validateData({
  params: params,
  query: query,
});

export async function getEngagements(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { id } = req.params as unknown as Params;
    const { before, limit } = req.query as unknown as Query;

    const blockedUsers = (
      await Block.find({ target: authUser._id }, "user")
    ).map((block) => block.user);

    const comments = await getComments(
      id,
      authUser._id,
      blockedUsers,
      before,
      limit,
    );

    const reactions = await getReactions(id, blockedUsers, before, limit);

    // Merge and sort by createdAt
    const mergedArray = [...comments, ...reactions].sort(
      (a, b) => b.createdAt - a.createdAt,
    );

    const paginatedEngagements = mergedArray.slice(0, limit);

    return res
      .status(StatusCodes.OK)
      .json(createResponse(paginatedEngagements));
  } catch (err) {
    next(err);
  }
}

async function getComments(
  id: Types.ObjectId,
  authId: Types.ObjectId,
  blockedUsers: Types.ObjectId[],
  before: Date,
  limit: number,
) {
  const comments = await Comment.aggregate([
    {
      $match: {
        userActivity: id,
        createdAt: { $lt: before },
        author: { $nin: blockedUsers },
      },
    },
    {
      $sort: {
        createdAt: -1,
      },
    },
    {
      $limit: limit,
    },
    {
      $lookup: {
        from: "users",
        localField: "author",
        foreignField: "_id",
        as: "author",
        pipeline: [
          {
            $project: UserProjection.essentials,
          },
        ],
      },
    },
    {
      $project: {
        resourceType: { $literal: "COMMENT" },
        resource: {
          _id: "$_id",
          content: "$content",
          mentions: "$mentions",
          createdAt: "$createdAt",
          updatedAt: "$updatedAt",
          author: { $arrayElemAt: ["$author", 0] },
          likes: { $size: "$likes" },
          liked: {
            $in: [authId, "$likes"],
          },
        },
      },
    },
  ]);

  return comments || [];
}

async function getReactions(
  id: Types.ObjectId,
  blockedUsers: Types.ObjectId[],
  before: Date,
  limit: number,
) {
  const reactions = await Reaction.aggregate([
    {
      $match: {
        target: id,
        createdAt: { $lt: before },
        user: { $nin: blockedUsers },
      },
    },
    {
      $sort: {
        createdAt: -1,
      },
    },
    {
      $limit: limit,
    },
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "user",
        pipeline: [
          {
            $project: UserProjection.essentials,
          },
        ],
      },
    },
    {
      $project: {
        resourceType: { $literal: "REACTION" },
        resource: {
          _id: "$_id",
          createdAt: "$createdAt",
          reaction: "$reaction",
          user: { $arrayElemAt: ["$user", 0] },
        },
      },
    },
  ]);

  return reactions || [];
}
