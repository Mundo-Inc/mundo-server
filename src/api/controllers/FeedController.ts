import type { NextFunction, Request, Response } from "express";
import { param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";

import ActivitySeen from "../../models/ActivitySeen";
import UserActivity from "../../models/UserActivity";
import { handleInputErrors } from "../../utilities/errorHandlers";
import { getUserFeed } from "../services/feed.service";
import validate from "./validators";
import Comment from "../../models/Comment";
import { publicReadUserProjection } from "../dto/user/read-user-public.dto";
import mongoose from "mongoose";

export const getFeedValidation: ValidationChain[] = [
  validate.page(query("page").optional()),
  validate.limit(query("limit").optional(), 10, 50),
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

    const comments = await Comment.aggregate([
      {
        $match: {
          userActivity: new mongoose.Types.ObjectId(id),
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
              $project: {
                _id: 1,
                name: 1,
                username: 1,
                level: 1,
                profileImage: 1,
                verified: 1,
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
