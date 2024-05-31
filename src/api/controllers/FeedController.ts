import type { NextFunction, Request, Response } from "express";
import { param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import Block from "../../models/Block.js";
import Comment from "../../models/Comment.js";
import UserActivity from "../../models/UserActivity.js";
import { dStrings, dynamicMessage } from "../../strings.js";
import {
  getConnectionStatus,
  getConnectionStatuses,
} from "../../utilities/connections.js";
import {
  createError,
  handleInputErrors,
} from "../../utilities/errorHandlers.js";
import { getPaginationFromQuery } from "../../utilities/pagination.js";
import UserProjection from "../dto/user.js";
import { getResourceInfo, getUserFeed } from "../services/feed.service.js";
import {
  getCommentsOfActivity,
  getReactionsOfActivity,
} from "./UserActivityController.js";
import validate from "./validators.js";

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

    const { page, limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 30,
      maxLimit: 50,
    });

    const isForYou = Boolean(req.query.isForYou) || false;

    const result = await getUserFeed(authUser._id, isForYou, limit, skip);

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

    const id = new mongoose.Types.ObjectId(req.params.id);

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

    const userActivityId = new mongoose.Types.ObjectId(req.params.id);

    const { page, limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 20,
      maxLimit: 50,
    });

    const blockedUsers = (
      await Block.find({ target: authUser._id }, "user")
    ).map((block) => block.user);

    const result = await Comment.aggregate([
      {
        $match: {
          userActivity: userActivityId,
          author: { $nin: blockedUsers },
          rootComment: null,
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
