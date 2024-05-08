import type { NextFunction, Request, Response } from "express";
import { param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose, { type FilterQuery } from "mongoose";

import Comment from "../../models/Comment";
import Follow from "../../models/Follow";
import Reaction from "../../models/Reaction";
import User, { type IUser } from "../../models/User";
import UserActivity, { type IUserActivity } from "../../models/UserActivity";
import strings from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import UserProjection from "../dto/user/user";
import { getResourceInfo } from "../services/feed.service";
import validate from "./validators";

export const getActivitiesOfaUserValidation: ValidationChain[] = [
  param("id").isMongoId(),
  query("type")
    .optional()
    .toUpperCase()
    .isIn([
      "NEW_CHECKIN",
      "NEW_REVIEW",
      "NEW_RECOMMEND",
      "REACT_TO_REVIEW",
      "REACT_TO_PLACE",
      "ADD_PLACE",
      "GOT_BADGE",
      "LEVEL_UP",
      "FOLLOWING",
    ]),
  validate.page(query("page").optional()),
  validate.limit(query("limit").optional(), 1, 50),
];

export async function getActivitiesOfaUser(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: authId } = req.user!;

    const userId = req.params.id;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;

    //PRIVACY
    const userObject: IUser | null = await User.findById(userId);
    if (userObject) {
      const isFollowed = await Follow.countDocuments({
        user: authId,
        target: userObject._id,
      });
      if (!isFollowed && userObject.isPrivate) {
        throw createError(
          strings.authorization.accessDenied,
          StatusCodes.UNAUTHORIZED
        );
      }
    }

    let query: FilterQuery<IUserActivity> = {
      userId,
    };

    if (req.query.type) {
      query.activityType = req.query.type as string;
    }

    const [total, userActivities] = await Promise.all([
      UserActivity.countDocuments(query),
      UserActivity.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    const result = [];

    for (const activity of userActivities) {
      const [
        [resourceInfo, placeInfo, userInfo],
        reactions,
        comments,
        commentsCount,
        followedByUser,
        followsUser,
      ] = await Promise.all([
        getResourceInfo(activity as IUserActivity),
        getReactionsOfActivity(
          activity._id as mongoose.Types.ObjectId,
          new mongoose.Types.ObjectId(userId)
        ),
        getCommentsOfActivity(
          activity._id as mongoose.Types.ObjectId,
          new mongoose.Types.ObjectId(userId)
        ),
        Comment.countDocuments({
          userActivity: activity._id,
        }),
        authId !== userId
          ? Follow.exists({ user: authId, target: userId })
          : null,
        authId !== userId
          ? Follow.exists({ user: userId, target: authId })
          : null,
      ]);

      if (authId !== userId) {
        userInfo.connectionStatus = {
          followedByUser: !!followedByUser,
          followsUser: !!followsUser,
        };
      }

      result.push({
        _id: activity._id,
        user: userInfo,
        place: placeInfo,
        activityType: activity.activityType,
        resourceType: activity.resourceType,
        resource: resourceInfo,
        privacyType: activity.privacyType,
        createdAt: activity.createdAt,
        updatedAt: activity.updatedAt,
        reactions: reactions[0],
        comments: comments,
        commentsCount,
      });
    }

    res.status(StatusCodes.OK).json({
      success: true,
      data: result || [],
      pagination: {
        totalCount: total,
        page,
        limit,
      },
    });
  } catch (err) {
    next(err);
  }
}

export function getReactionsOfActivity(
  activityId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId
) {
  return Reaction.aggregate([
    {
      $match: {
        target: activityId,
      },
    },
    {
      $facet: {
        total: [
          {
            $group: {
              _id: "$reaction",
              count: { $sum: 1 },
              type: { $first: "$type" },
            },
          },
          {
            $project: {
              _id: 0,
              reaction: "$_id",
              type: 1,
              count: 1,
            },
          },
        ],
        user: [
          {
            $match: {
              user: userId,
            },
          },
          {
            $project: {
              _id: 1,
              type: 1,
              reaction: 1,
              createdAt: 1,
            },
          },
        ],
      },
    },
  ]);
}

export function getCommentsOfActivity(
  activityId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId
) {
  return Comment.aggregate([
    {
      $match: {
        userActivity: activityId,
      },
    },
    {
      $limit: 3,
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
        _id: 1,
        createdAt: 1,
        updatedAt: 1,
        content: 1,
        mentions: 1,
        author: { $arrayElemAt: ["$author", 0] },
        likes: { $size: "$likes" },
        liked: {
          $in: [userId, "$likes"],
        },
      },
    },
  ]);
}
