import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import type { FilterQuery, Types } from "mongoose";
import { z } from "zod";

import { getResourceInfo } from "../../../api/services/feed.service.js";
import Comment from "../../../models/Comment.js";
import Follow from "../../../models/Follow.js";
import User from "../../../models/User.js";
import type { IUserActivity } from "../../../models/UserActivity.js";
import UserActivity, {
  ActivityTypeEnum,
  ResourcePrivacyEnum,
} from "../../../models/UserActivity.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { getConnectionStatuses } from "../../../utilities/connections.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { getPaginationFromQuery } from "../../../utilities/pagination.js";
import {
  validateData,
  zObjectId,
  zPaginationSpread,
} from "../../../utilities/validation.js";
import {
  getCommentsOfActivity,
  getReactionsOfActivity,
} from "../activity/helpers.js";

const params = z.object({
  userId: zObjectId,
});
const query = z.object({
  ...zPaginationSpread,
  type: z
    .string()
    .toUpperCase()
    .refine((value) =>
      Object.values(ActivityTypeEnum).includes(value as ActivityTypeEnum),
    )
    .transform((value) => value as ActivityTypeEnum)
    .optional(),
  types: z
    .string()
    .transform((value) =>
      value.split(",").map((type) => type.trim().toUpperCase()),
    )
    .refine(
      (value) =>
        value.every((type) =>
          Object.values(ActivityTypeEnum).includes(type as ActivityTypeEnum),
        ),
      {
        message: "Invalid activity type found in the list",
      },
    )
    .transform((value) => value as ActivityTypeEnum[])
    .optional(),
});

type Params = z.infer<typeof params>;
type Query = z.infer<typeof query>;

export const getActivitiesOfaUserValidation = validateData({
  params: params,
  query: query,
});

export async function getActivitiesOfaUser(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { userId } = req.params as unknown as Params;

    const { page, limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 20,
      maxLimit: 50,
    });

    const { type, types } = req.query as Query;

    //PRIVACY
    const user = await User.findById(userId).orFail(
      createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND),
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
          StatusCodes.FORBIDDEN,
        ),
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
        getResourceInfo(activity, authUser._id),
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
