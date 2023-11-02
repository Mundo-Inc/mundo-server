import type { NextFunction, Request, Response } from "express";
import { handleInputErrors } from "../../utilities/errorHandlers";
import { StatusCodes } from "http-status-codes";
import { ValidationChain, param, query } from "express-validator";
import UserActivity from "../../models/UserActivity";
import { getResourceInfo } from "../services/feed.service";
import mongoose from "mongoose";
import { publicReadUserProjectionAG } from "../dto/user/read-user-public.dto";
import Comment from "../../models/Comment";
import Reaction from "../../models/Reaction";

export const getActivitiesOfaUserValidation: ValidationChain[] = [
  param("id").isMongoId(),
  query("page").optional().isInt(),
  query("limit").optional().isInt(),
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

    const total = await UserActivity.countDocuments({ userId });
    const userActivities = await UserActivity.find({ userId })
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
              $in: [new mongoose.Types.ObjectId(userId), "$likes"],
            },
          },
        },
      ]);

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
      });
    }

    res
      .status(StatusCodes.OK)
      .json({ success: true, data: result || [], total: total });
  } catch (err) {
    next(err);
  }
}
