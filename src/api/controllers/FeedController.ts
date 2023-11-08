import type { NextFunction, Request, Response } from "express";
import { param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import ActivitySeen from "../../models/ActivitySeen";
import Block from "../../models/Block";
import Comment from "../../models/Comment";
import Follow, { IFollow } from "../../models/Follow";
import Reaction from "../../models/Reaction";
import UserActivity from "../../models/UserActivity";
import { dStrings, dynamicMessage } from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { publicReadUserProjectionAG } from "../dto/user/read-user-public.dto";
import { getResourceInfo, getUserFeed } from "../services/feed.service";
import { getForYouFeed } from "../services/foryou.service";
import validate from "./validators";

export const getFeedValidation: ValidationChain[] = [
  validate.page(query("page").optional()),
  validate.limit(query("limit").optional(), 5, 50),
  validate.lng(query("lng").optional()),
  validate.lat(query("lat").optional()),
];
export async function getFeed(req: Request, res: Response, next: NextFunction) {
  try {
    handleInputErrors(req);

    const { id: authId } = req.user!;

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const { lng, lat } = req.query;

    const result = await getUserFeed(
      authId,
      page,
      limit,
      lng && lat
        ? { lng: Number(lng as string), lat: Number(lat as string) }
        : undefined
    );

    res.status(StatusCodes.OK).json({ success: true, result: result || [] });
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

    const followings: IFollow[] = await Follow.find(
      {
        user: authId,
      },
      {
        target: 1,
      }
    ).lean();

    const activity = await UserActivity.findOne({
      _id: id,
      userId: {
        $in: [
          ...followings.map((f: IFollow) => f.target),
          new mongoose.Types.ObjectId(authId),
        ],
      },
    });

    if (!activity) {
      throw createError(
        dynamicMessage(dStrings.notFound, "Activity"),
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

    const reactions = await Reaction.aggregate([
      {
        $match: {
          target: activity._id,
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
                user: new mongoose.Types.ObjectId(authId),
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

    const comments = await Comment.aggregate([
      {
        $match: {
          userActivity: activity._id,
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
              // TODO: Test
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

    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        id: activity._id,
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
              // TODO: Test
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

export async function getForYou(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: authId } = req.user!;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const { lng, lat } = req.query;

    const result = await getForYouFeed(
      authId,
      page,
      limit,
      lng && lat
        ? { lng: Number(lng as string), lat: Number(lat as string) }
        : undefined
    );

    res.status(StatusCodes.OK).json({ success: true, result: result || [] });
  } catch (err) {
    next(err);
  }
}
