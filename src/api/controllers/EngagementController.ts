import { NextFunction, Request, Response } from "express";
import { handleInputErrors } from "../../utilities/errorHandlers";
import Block from "../../models/Block";
import mongoose from "mongoose";
import { publicReadUserProjectionAG } from "../dto/user/read-user-public.dto";
import Comment from "../../models/Comment";
import { IUser } from "../../models/User";
import Reaction from "../../models/Reaction";
import { ValidationChain, param, query } from "express-validator";
import validate from "./validators";

export const getEngagementsValidation: ValidationChain[] = [
  param("id").isMongoId(),
  query("before")
    .optional()
    .custom((value) => {
      const timestamp = Number(value);
      const date = new Date(timestamp);
      return !isNaN(timestamp) && !isNaN(date.getTime());
    }),
  validate.limit(query("limit").optional(), 1, 40),
];

export async function getEngagements(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: authId } = req.user!;
    const { id } = req.params;

    const before = req.query.before
      ? new Date(Number(req.query.before))
      : new Date();

    const limit = Number(req.query.limit) || 20;

    const blockedUsers = (await Block.find({ target: authId }, "user")).map(
      (block) => block.user
    );

    const comments = await getComments(id, authId, blockedUsers, before, limit);

    const reactions = await getReactions(
      id,
      authId,
      blockedUsers,
      before,
      limit
    );

    // Merge and sort by createdAt
    const mergedArray = [...comments, ...reactions].sort(
      (a, b) => b.createdAt - a.createdAt
    );

    const paginatedEngagements = mergedArray.slice(0, limit);

    // Send response
    return res.json(paginatedEngagements);
  } catch (err) {
    next(err);
  }
}

async function getComments(
  id: string,
  authId: string,
  blockedUsers: IUser[],
  before: Date,
  limit: number
) {
  const comments = await Comment.aggregate([
    {
      $match: {
        userActivity: new mongoose.Types.ObjectId(id),
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
            $lookup: {
              from: "achievements",
              localField: "progress.achievements",
              foreignField: "_id",
              as: "progress.achievements",
            },
          },
          {
            $project: publicReadUserProjectionAG,
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
            $in: [new mongoose.Types.ObjectId(authId), "$likes"],
          },
        },
      },
    },
  ]);

  return comments || [];
}

async function getReactions(
  id: string,
  authId: string,
  blockedUsers: IUser[],
  before: Date,
  limit: number
) {
  const reactions = await Reaction.aggregate([
    {
      $match: {
        target: new mongoose.Types.ObjectId(id),
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
            $lookup: {
              from: "achievements",
              localField: "progress.achievements",
              foreignField: "_id",
              as: "progress.achievements",
            },
          },
          {
            $project: publicReadUserProjectionAG,
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
