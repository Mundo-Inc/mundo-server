import type { NextFunction, Request, Response } from "express";
import { param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import Block from "../../models/Block";
import Comment from "../../models/Comment";
import UserActivity from "../../models/UserActivity";
import { dStrings, dynamicMessage } from "../../strings";
import {
  getConnectionStatus,
  getConnectionStatuses,
} from "../../utilities/connections";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import UserProjection from "../dto/user";
import { getResourceInfo, getUserFeed } from "../services/feed.service";
import {
  getCommentsOfActivity,
  getReactionsOfActivity,
} from "./UserActivityController";
import validate from "./validators";

export const getFeedValidation: ValidationChain[] = [
  validate.page(query("page").optional()),
  validate.limit(query("limit").optional(), 5, 50),
  query("isForYou")
    .optional()
    .isBoolean()
    .withMessage("isForYou must be a boolean"),
];
export async function getFeed(req: Request, res: Response, next: NextFunction) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 30;
    const isForYou = Boolean(req.query.isForYou) || false;

    const result = await getUserFeed(authUser._id, isForYou, page, limit);

    // Get follow status for each user
    const usersIdSet = new Set<string>();

    result.forEach((activity) => {
      const userId = activity.user._id.toString();
      if (!authUser._id.equals(userId)) {
        usersIdSet.add(userId);
      }

      if (activity.resourceType === "User") {
        const resourceId = activity.resource._id.toString();
        if (!authUser._id.equals(resourceId)) {
          usersIdSet.add(resourceId);
        }
      }
    });

    const usersObject = await getConnectionStatuses(
      authUser._id,
      Array.from(usersIdSet)
    );

    result.forEach((activity) => {
      activity.user.connectionStatus =
        usersObject[activity.user._id.toString()];

      if (activity.resourceType === "User") {
        const resourceId = activity.resource._id.toString();
        activity.resource.connectionStatus = usersObject[resourceId];
      }

      // TODO: remove on next release
      activity.privacyType = "PUBLIC";
    });

    res.status(StatusCodes.OK).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export const getActivityValidation: ValidationChain[] = [
  param("id").isMongoId(),
];
export async function getActivity(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;
    const { id } = req.params;

    const activity = await UserActivity.findById(id).orFail(
      createError(
        "Either the activity does not exist or you do not have permission to view it",
        StatusCodes.NOT_FOUND
      )
    );

    const [resourceInfo, placeInfo, userInfo] = await getResourceInfo(activity);

    if (!resourceInfo) {
      throw createError(
        dynamicMessage(dStrings.notFound, "Resource"),
        StatusCodes.NOT_FOUND
      );
    }

    const [reactions, comments, commentsCount, connectionStatus] =
      await Promise.all([
        getReactionsOfActivity(activity._id, authUser._id),
        getCommentsOfActivity(activity._id, authUser._id),
        Comment.countDocuments({
          userActivity: activity._id,
        }),
        getConnectionStatus(authUser._id, id),
      ]);

    userInfo.connectionStatus = connectionStatus;

    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        _id: activity._id,
        user: userInfo,
        place: placeInfo,
        activityType: activity.activityType,
        resourceType: activity.resourceType,
        resource: resourceInfo,
        privacyType: "PUBLIC", // TODO: remove on next release
        resourcePrivacy: activity.resourcePrivacy,
        isAccountPrivate: activity.isAccountPrivate,
        createdAt: activity.createdAt,
        updatedAt: activity.updatedAt,
        reactions: reactions[0],
        comments: comments,
        commentsCount,
      },
    });
  } catch (err) {
    next(err);
  }
}

// TODO: This endpoint needs to be fixed
// export const activitySeenValidation: ValidationChain[] = [
//   param("id").isMongoId(),
// ];
// export async function activitySeen(
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) {
//   try {
//     handleInputErrors(req);

//     const authUser = req.user!;
//     const { id } = req.params;

//     const activity = await UserActivity.findById(id);
//     const seen = await ActivitySeen.findOne({
//       subjectId: activity.userId,
//       observerId: authUser._id,
//       activityId: id,
//     });
//     const weight = seen ? seen.weight + 1 : 1;
//     await ActivitySeen.updateOne(
//       {
//         subjectId: activity.userId,
//         observerId: authUser._id,
//         activityId: id,
//       },
//       {
//         seenAt: new Date(),
//         weight,
//       },
//       { upsert: true }
//     );
//     res.sendStatus(StatusCodes.NO_CONTENT);
//   } catch (err) {
//     next(err);
//   }
// }

export const getCommentsValidation: ValidationChain[] = [
  param("id").isMongoId(),
  validate.page(query("page").optional()),
  validate.limit(query("limit").optional(), 10, 50),
];
export async function getComments(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;
    const { id } = req.params;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;

    const blockedUsers = (
      await Block.find({ target: authUser._id }, "user")
    ).map((block) => block.user);

    const result = await Comment.aggregate([
      {
        $match: {
          userActivity: new mongoose.Types.ObjectId(id),
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
              $skip: (page - 1) * limit,
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
                _id: 1,
                createdAt: 1,
                updatedAt: 1,
                content: 1,
                mentions: 1,
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
