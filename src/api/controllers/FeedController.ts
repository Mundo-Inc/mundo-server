import type { NextFunction, Request, Response } from "express";
import { param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import ActivitySeen from "../../models/ActivitySeen";
import Block from "../../models/Block";
import Comment from "../../models/Comment";
import Follow from "../../models/Follow";
import UserActivity from "../../models/UserActivity";
import { dStrings, dynamicMessage } from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { publicReadUserEssentialProjection } from "../dto/user/read-user-public.dto";
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

    const { id: authId } = req.user!;

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 30;
    const isForYou = Boolean(req.query.isForYou) || false;

    const result = await getUserFeed(authId, isForYou, page, limit);

    // Get follow status for each user
    const usersObject: {
      [key: string]: {
        followedByUser: boolean;
        followsUser: boolean;
      };
    } = {};

    result.forEach((activity) => {
      const userId = activity.user._id.toString();
      if (!usersObject[userId] && userId !== authId) {
        usersObject[userId] = {
          followedByUser: false,
          followsUser: false,
        };
      }

      if (activity.resourceType === "User") {
        const resourceId = activity.resource._id.toString();
        if (!usersObject[resourceId] && resourceId !== authId) {
          usersObject[resourceId] = {
            followedByUser: false,
            followsUser: false,
          };
        }
      }
    });

    const followItems = await Follow.find({
      $or: [
        {
          user: authId,
          target: Object.keys(usersObject),
        },
        {
          target: authId,
          user: Object.keys(usersObject),
        },
      ],
    })
      .select({
        target: 1,
        user: 1,
      })
      .lean();

    followItems.forEach((f) => {
      const userId = f.user.toString();
      if (userId === authId) {
        usersObject[f.target.toString()].followedByUser = true;
      } else {
        usersObject[userId].followsUser = true;
      }
    });

    result.forEach((activity) => {
      // TODO: remove next line after updating client
      if (activity.resourceType === "CheckIn") {
        activity.resourceType = "Checkin";
      }

      const userId = activity.user._id.toString();
      activity.user.connectionStatus = usersObject[userId];

      if (activity.resourceType === "User") {
        const resourceId = activity.resource._id.toString();
        activity.resource.connectionStatus = usersObject[resourceId];
      }
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

    const { id: authId } = req.user!;
    const { id } = req.params;

    // const followings: IFollow[] = await Follow.find(
    //   {
    //     user: authId,
    //   },
    //   {
    //     target: 1,
    //   }
    // ).lean();

    // const activity = await UserActivity.findOne({
    //   _id: id,
    //   userId: {
    //     $in: [
    //       ...followings.map((f: IFollow) => f.target),
    //       new mongoose.Types.ObjectId(authId),
    //     ],
    //   },
    // });

    const activity = await UserActivity.findById(id);

    if (!activity) {
      throw createError(
        "Either the activity does not exist or you do not have permission to view it",
        StatusCodes.NOT_FOUND
      );
    }

    const [resourceInfo, placeInfo, userInfo] = await getResourceInfo(activity);

    if (!resourceInfo) {
      throw createError(
        dynamicMessage(dStrings.notFound, "Resource"),
        StatusCodes.NOT_FOUND
      );
    }

    const [reactions, comments, commentsCount, followedByUser, followsUser] =
      await Promise.all([
        getReactionsOfActivity(
          activity._id,
          new mongoose.Types.ObjectId(authId)
        ),
        getCommentsOfActivity(
          activity._id,
          new mongoose.Types.ObjectId(authId)
        ),
        Comment.countDocuments({
          userActivity: activity._id,
        }),
        Follow.exists({ user: authId, target: id }),
        Follow.exists({ user: id, target: authId }),
      ]);

    userInfo.connectionStatus = {
      followedByUser: !!followedByUser,
      followsUser: !!followsUser,
    };

    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        _id: activity._id,
        id: activity._id,
        user: userInfo,
        place: placeInfo,
        activityType: activity.activityType,
        // TODO: remove check in next line after updating client
        resourceType:
          activity.resourceType === "CheckIn"
            ? "Checkin"
            : activity.resourceType,
        resource: resourceInfo,
        privacyType: activity.privacyType,
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

export const activitySeenValidation: ValidationChain[] = [
  param("id").isMongoId(),
];
export async function activitySeen(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: authId } = req.user!;
    const { id } = req.params;

    const activity = await UserActivity.findById(id);
    const seen = await ActivitySeen.findOne({
      subjectId: activity.userId,
      observerId: authId,
      activityId: id,
    });
    const weight = seen ? seen.weight + 1 : 1;
    await ActivitySeen.updateOne(
      {
        subjectId: activity.userId,
        observerId: authId,
        activityId: id,
      },
      {
        seenAt: new Date(),
        weight,
      },
      { upsert: true }
    );
    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}

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

    const { id: authId } = req.user!;
    const { id } = req.params;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;

    const blockedUsers = (await Block.find({ target: authId }, "user")).map(
      (block) => block.user
    );

    const comments = await Comment.aggregate([
      {
        $match: {
          userActivity: new mongoose.Types.ObjectId(id),
          author: { $nin: blockedUsers },
        },
      },
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
              $project: publicReadUserEssentialProjection,
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
            $in: [new mongoose.Types.ObjectId(authId), "$likes"],
          },
        },
      },
    ]);

    res.status(StatusCodes.OK).json({ success: true, data: comments });
  } catch (err) {
    next(err);
  }
}
