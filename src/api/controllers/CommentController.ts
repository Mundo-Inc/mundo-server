import type { NextFunction, Request, Response } from "express";
import { body, param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import Comment, { type IMention } from "../../models/Comment.js";
import User from "../../models/User.js";
import UserActivity from "../../models/UserActivity.js";
import strings, { dStrings as ds, dynamicMessage } from "../../strings.js";
import {
  createError,
  handleInputErrors,
} from "../../utilities/errorHandlers.js";
import { getPaginationFromQuery } from "../../utilities/pagination.js";
import UserProjection, { type UserProjectionEssentials } from "../dto/user.js";
import DeletionService from "../services/DeletionService.js";
import { addReward } from "../services/reward/reward.service.js";
import validate from "./validators.js";
import Block from "../../models/Block.js";

export const createCommentValidation: ValidationChain[] = [
  body("activity").isMongoId().withMessage("Invalid activity id"),
  body("content").isString().isLength({ min: 1, max: 500 }),
  body("parent").optional().isMongoId().withMessage("Invalid parent id"),
];

export async function createComment(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const content: string = req.body.content;
    const activityId = new mongoose.Types.ObjectId(req.body.activity as string);
    const parent = req.body.parent
      ? new mongoose.Types.ObjectId(req.body.parent as string)
      : undefined;

    const user = await User.findById(authUser._id)
      .select<UserProjectionEssentials>(UserProjection.essentials)
      .orFail(
        createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND)
      )
      .lean();

    await UserActivity.exists({ _id: activityId }).orFail(
      createError(
        dynamicMessage(ds.notFound, "Activity"),
        StatusCodes.NOT_FOUND
      )
    );

    // IComment
    const body: Record<string, any> = {
      author: authUser._id,
      userActivity: activityId,
      content,
    };

    const parentComment =
      parent &&
      (await Comment.findById(parent).orFail(
        createError(
          dynamicMessage(ds.notFound, "Parent comment"),
          StatusCodes.NOT_FOUND
        )
      ));

    if (parentComment) {
      body.parent = parent;
      if (parentComment.rootComment) {
        body.rootComment = parentComment.rootComment;
      } else {
        body.rootComment = parent;
      }
    }

    // extract mentions
    const mentions = content.match(/@(\w+)/g);

    if (mentions) {
      const toAdd: IMention[] = [];

      const mentionsSet = new Set(mentions);

      for (const mention of mentionsSet) {
        const user = await User.findOne({
          username: new RegExp(`^${mention.slice(1)}$`, "i"),
        })
          .select<{
            username: string;
          }>("username")
          .lean();

        if (user) {
          toAdd.push({
            user: user._id,
            username: user.username,
          });
        }
      }

      if (toAdd.length > 0) {
        body.mentions = toAdd;
      }
    }

    const comment = await Comment.create(body);

    if (parentComment) {
      parentComment.children.push(comment._id);
      await parentComment.save();
    }

    // update comments count in user activity
    await UserActivity.updateOne(
      { _id: activityId },
      { $inc: { "engagements.comments": 1 } }
    );

    // adding reward
    const reward = await addReward(user._id, {
      refType: "Comment",
      refId: comment._id,
      userActivityId: activityId,
    });

    res.status(StatusCodes.CREATED).json({
      success: true,
      data: {
        ...comment.toObject(),
        author: user,
        likes: 0,
        liked: false,
        status: undefined,
      },
      reward: reward,
    });
  } catch (err) {
    next(err);
  }
}

export const getCommentRepliesValidation: ValidationChain[] = [
  param("id").isMongoId().withMessage("Invalid comment id"),
  validate.page(query("page").optional()),
  validate.limit(query("limit").optional(), 10, 50),
];

export async function getCommentReplies(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const id = new mongoose.Types.ObjectId(req.params.id);

    const { page, limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 20,
      maxLimit: 50,
    });

    const comment = await Comment.findById(id).orFail(
      createError(dynamicMessage(ds.notFound, "Comment"), StatusCodes.NOT_FOUND)
    );

    if (comment.children.length === 0) {
      return res.status(StatusCodes.OK).json({
        success: true,
        data: [],
      });
    }

    const blockedUsers = (
      await Block.find({ target: authUser._id }, "user")
    ).map((block) => block.user);

    const result = await Comment.aggregate([
      {
        $match: {
          _id: { $in: comment.children },
          author: { $nin: blockedUsers },
        },
      },
      {
        $facet: {
          comments: [
            {
              $sort: {
                createdAt: -1,
              },
            },
            {
              $skip: skip,
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
              // count children comments
              $addFields: {
                repliesCount: { $size: "$children" },
              },
            },
            {
              $lookup: {
                from: "comments",
                localField: "children",
                foreignField: "_id",
                as: "replies",
                pipeline: [
                  {
                    $limit: 2,
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
                    $addFields: {
                      repliesCount: { $size: "$children" },
                    },
                  },
                  {
                    $project: {
                      _id: 1,
                      createdAt: 1,
                      updatedAt: 1,
                      content: 1,
                      mentions: 1,
                      rootComment: 1,
                      parent: 1,
                      repliesCount: 1,
                      replies: [],
                      author: { $arrayElemAt: ["$author", 0] },
                      likes: { $size: "$likes" },
                      liked: {
                        $in: [authUser._id, "$likes"],
                      },
                    },
                  },
                ],
              },
            },
            {
              $project: {
                _id: 1,
                createdAt: 1,
                updatedAt: 1,
                content: 1,
                mentions: 1,
                rootComment: 1,
                parent: 1,
                repliesCount: 1,
                replies: 1,
                author: { $arrayElemAt: ["$author", 0] },
                likes: { $size: "$likes" },
                liked: {
                  $in: [authUser._id, "$likes"],
                },
              },
            },
          ],
          count: [
            {
              $count: "count",
            },
          ],
        },
      },
    ]).then((result) => result[0]);

    res.status(StatusCodes.OK).json({
      success: true,
      data: result.comments,
      pagination: {
        totalCount: result.count[0]?.count || 0,
        page: page,
        limit: limit,
      },
    });
  } catch (err) {
    next(err);
  }
}

export const deleteCommentValidation: ValidationChain[] = [
  param("id").isMongoId().withMessage("Invalid comment id"),
];

export async function deleteComment(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const id = new mongoose.Types.ObjectId(req.params.id);

    await DeletionService.deleteComment(id, (comment) => {
      if (!authUser._id.equals(comment.author)) {
        throw createError(
          "You are not authorized to delete this comment",
          StatusCodes.FORBIDDEN
        );
      }
    });

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}

export const likeCommentValidation: ValidationChain[] = [
  param("id").isMongoId().withMessage("Invalid comment id"),
];

export async function likeComment(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const id = new mongoose.Types.ObjectId(req.params.id);

    const comment = await Comment.findById(id).orFail(
      createError(dynamicMessage(ds.notFound, "Comment"), StatusCodes.NOT_FOUND)
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
        liked: true,
      },
    });
  } catch (err) {
    next(err);
  }
}

export const deleteCommentLikeValidation: ValidationChain[] = [
  param("id").isMongoId().withMessage("Invalid comment id"),
];

export async function deleteCommentLike(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const id = new mongoose.Types.ObjectId(req.params.id);

    const comment = await Comment.findById(id).orFail(
      createError(dynamicMessage(ds.notFound, "Comment"), StatusCodes.NOT_FOUND)
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
