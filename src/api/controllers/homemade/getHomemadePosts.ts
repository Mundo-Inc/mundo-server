import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import type { PipelineStage } from "mongoose";
import { z } from "zod";

import MediaProjection from "../../../api/dto/media.js";
import UserProjection from "../../../api/dto/user.js";
import Homemade from "../../../models/Homemade.js";
import { getPaginationFromQuery } from "../../../utilities/pagination.js";
import { createResponse } from "../../../utilities/response.js";
import {
  validateData,
  zObjectId,
  zPaginationSpread,
} from "../../../utilities/validation.js";

const query = z.object({
  ...zPaginationSpread,
  user: zObjectId.optional(),
  sort: z.enum(["newest", "oldest"]).optional().default("newest"),
});

type Query = z.infer<typeof query>;

export const getHomemadePostsValidation = validateData({
  query: query,
});

export async function getHomemadePosts(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { sort, user } = req.query as unknown as Query;

    const { limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 20,
      maxLimit: 50,
    });

    const pipeline: PipelineStage[] = [];

    if (user) {
      pipeline.push({
        $match: { user: user },
      });
    }

    pipeline.push(
      { $sort: { createdAt: sort === "newest" ? -1 : 1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "media",
          localField: "media",
          foreignField: "_id",
          as: "media",
          pipeline: [
            {
              $project: MediaProjection.brief,
            },
          ],
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "tags",
          foreignField: "_id",
          as: "tags",
          pipeline: [
            {
              $project: UserProjection.essentials,
            },
          ],
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user",
          pipeline: [
            {
              $project: UserProjection.essentials,
            },
          ],
        },
      },
      {
        $lookup: {
          from: "reactions",
          let: {
            userActivityId: "$userActivityId",
          },
          as: "reactions",
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$target", "$$userActivityId"] },
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
                      user: authUser._id,
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
          ],
        },
      },
      {
        $project: {
          _id: 1,
          createdAt: 1,
          updatedAt: 1,
          content: 1,
          user: { $arrayElemAt: ["$user", 0] },
          media: 1,
          tags: 1,
          reactions: { $arrayElemAt: ["$reactions", 0] },
        },
      },
    );

    const homemades = await Homemade.aggregate(pipeline);

    res.status(StatusCodes.OK).json(createResponse(homemades));
  } catch (err) {
    next(err);
  }
}
