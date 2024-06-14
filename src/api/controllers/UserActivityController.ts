import type { NextFunction, Request, Response } from "express";
import { param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose, { Types, type FilterQuery } from "mongoose";

import Comment from "../../models/Comment.js";
import Follow from "../../models/Follow.js";
import Reaction from "../../models/Reaction.js";
import User from "../../models/User.js";
import UserActivity, {
  ActivityTypeEnum,
  ResourcePrivacyEnum,
  type IUserActivity,
} from "../../models/UserActivity.js";
import { dStrings, dynamicMessage } from "../../strings.js";
import { getConnectionStatuses } from "../../utilities/connections.js";
import {
  createError,
  handleInputErrors,
} from "../../utilities/errorHandlers.js";
import { getPaginationFromQuery } from "../../utilities/pagination.js";
import UserProjection from "../dto/user.js";
import { getResourceInfo } from "../services/feed.service.js";
import validate from "./validators.js";

export const getActivitiesOfaUserValidation: ValidationChain[] = [
  param("id").isMongoId(),
  query("type").optional().toUpperCase().isIn(Object.values(ActivityTypeEnum)),
  query("types")
    .optional()
    .isString()
    .customSanitizer((value) => {
      if (!value) {
        return undefined;
      }

      return value.split(",");
    })
    .custom((value) => {
      if (!Array.isArray(value)) {
        throw new Error("Invalid types");
      }

      for (const type of value) {
        if (
          !Object.values(ActivityTypeEnum).includes(type as ActivityTypeEnum)
        ) {
          throw new Error(`Invalid type: ${type}`);
        }
      }

      return true;
    }),
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

    const authUser = req.user!;

    const userId = new Types.ObjectId(req.params.id);

    const { page, limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 20,
      maxLimit: 50,
    });

    const type: ActivityTypeEnum | undefined = req.query.type
      ? (req.query.type as ActivityTypeEnum)
      : undefined;
    const types: ActivityTypeEnum[] | undefined = req.query.types
      ? (req.query.types as ActivityTypeEnum[])
      : undefined;

    //PRIVACY
    const user = await User.findById(userId).orFail(
      createError(
        dynamicMessage(dStrings.notFound, "User"),
        StatusCodes.NOT_FOUND
      )
    );

    const query: FilterQuery<IUserActivity> = {
      userId,
    };

    if (!authUser._id.equals(user._id) && user.isPrivate) {
      await Follow.exists({
        user: authUser._id,
        target: user._id,
      }).orFail(
        createError(
          "You are not allowed to view this user's activities.",
          StatusCodes.FORBIDDEN
        )
      );

      query.resourcePrivacy = { $ne: ResourcePrivacyEnum.Private };
    }

    if (type) {
      query.activityType = type;
    } else if (types) {
      query.activityType = { $in: types };
    }

    const [total, userActivities] = await Promise.all([
      UserActivity.countDocuments(query),
      UserActivity.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const result = [];
    const userIds: Types.ObjectId[] = [];

    for (const activity of userActivities) {
      const [
        [resourceInfo, placeInfo, userInfo],
        reactions,
        comments,
        commentsCount,
      ] = await Promise.all([
        getResourceInfo(activity),
        getReactionsOfActivity(activity._id, authUser._id),
        getCommentsOfActivity(activity._id, authUser._id),
        Comment.countDocuments({
          userActivity: activity._id,
        }),
      ]);

      userIds.push(userInfo._id);

      result.push({
        _id: activity._id,
        user: userInfo,
        place: placeInfo,
        activityType: activity.activityType,
        resourceType: activity.resourceType,
        resource: resourceInfo,
        privacyType: "PUBLIC", // TODO: remove on next update
        resourcePrivacy: activity.resourcePrivacy,
        isAccountPrivate: activity.isAccountPrivate,
        createdAt: activity.createdAt,
        updatedAt: activity.updatedAt,
        reactions: reactions[0],
        comments: comments,
        commentsCount,
      });
    }

    const usersObject = await getConnectionStatuses(authUser._id, userIds);

    for (const activity of result) {
      activity.user.connectionStatus =
        usersObject[activity.user._id.toString()];
    }

    res.status(StatusCodes.OK).json({
      success: true,
      data: result,
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
  authId: mongoose.Types.ObjectId
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
              user: authId,
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
  authId: mongoose.Types.ObjectId
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
          $in: [authId, "$likes"],
        },
      },
    },
  ]);
}
