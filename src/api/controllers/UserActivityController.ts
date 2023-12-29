import type { NextFunction, Request, Response } from "express";
import { ValidationChain, param, query } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import Comment from "../../models/Comment";
import Reaction from "../../models/Reaction";
import UserActivity from "../../models/UserActivity";
import { handleInputErrors } from "../../utilities/errorHandlers";
import { publicReadUserProjection } from "../dto/user/read-user-public.dto";
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
      "CREATE_DEAL",
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

    const userId = req.params.id;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;

    const total = await UserActivity.countDocuments({
      userId,
      ...(req.query.type
        ? {
            activityType: req.query.type,
          }
        : {}),
    });
    const userActivities = await UserActivity.find({
      userId,
      ...(req.query.type
        ? {
            activityType: req.query.type,
          }
        : {}),
    })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const result = [];

    for (const _act of userActivities) {
      const [resourceInfo, placeInfo, userInfo] = await getResourceInfo(_act);
      const reactions = await Reaction.aggregate([
        {
          $match: {
            target: _act._id,
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
                  user: new mongoose.Types.ObjectId(userId),
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
            userActivity: _act._id,
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
                $lookup: {
                  from: "achievements",
                  localField: "progress.achievements",
                  foreignField: "_id",
                  as: "progress.achievements",
                },
              },
              {
                $project: publicReadUserProjection,
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
              $in: [new mongoose.Types.ObjectId(userId), "$likes"],
            },
          },
        },
      ]);

      const commentsCount = await Comment.countDocuments({
        userActivity: _act._id,
      });

      result.push({
        id: _act._id,
        user: userInfo,
        place: placeInfo,
        activityType: _act.activityType,
        resourceType: _act.resourceType,
        resource: resourceInfo,
        privacyType: _act.privacyType,
        createdAt: _act.createdAt,
        updatedAt: _act.updatedAt,
        score: 0,
        weight: 0,
        reactions: reactions[0],
        comments: comments,
        commentsCount,
      });
    }

    res
      .status(StatusCodes.OK)
      .json({ success: true, data: result || [], total: total });
  } catch (err) {
    next(err);
  }
}
