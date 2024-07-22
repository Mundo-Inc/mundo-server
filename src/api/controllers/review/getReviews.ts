import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import type { PipelineStage } from "mongoose";
import { z } from "zod";

import MediaProjection from "../../../api/dto/media.js";
import UserProjection from "../../../api/dto/user.js";
import Review from "../../../models/Review.js";
import { getPaginationFromQuery } from "../../../utilities/pagination.js";
import {
  validateData,
  zObjectId,
  zPaginationSpread,
} from "../../../utilities/validation.js";

const query = z.object({
  ...zPaginationSpread,
  writer: zObjectId.optional(),
  sort: z.enum(["newest", "oldest"]).optional().default("newest"),
});

type Query = z.infer<typeof query>;

export const getReviewsValidation = validateData({
  query: query,
});

export async function getReviews(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { writer, sort } = req.query as unknown as Query;

    const { limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 10,
      maxLimit: 50,
    });

    let pipeline: PipelineStage[] = [];

    if (writer) {
      pipeline.push({
        $match: { writer: writer },
      });
    }

    pipeline.push(
      { $sort: { createdAt: sort === "oldest" ? 1 : -1 } },
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
          localField: "writer",
          foreignField: "_id",
          as: "writer",
          pipeline: [
            {
              $project: UserProjection.essentials,
            },
          ],
        },
      },
      {
        $lookup: {
          from: "places",
          localField: "place",
          foreignField: "_id",
          as: "place",
          pipeline: [
            {
              $project: {
                _id: 1,
                name: 1,
                thumbnail: 1,
                description: 1,
                location: {
                  geoLocation: {
                    lng: {
                      $arrayElemAt: ["$location.geoLocation.coordinates", 0],
                    },
                    lat: {
                      $arrayElemAt: ["$location.geoLocation.coordinates", 1],
                    },
                  },
                  address: 1,
                  city: 1,
                  state: 1,
                  country: 1,
                  zip: 1,
                },
                scores: {
                  overall: 1,
                  drinkQuality: 1,
                  foodQuality: 1,
                  service: 1,
                  atmosphere: 1,
                  value: 1,
                  phantom: {
                    $cond: {
                      if: { $lt: ["$reviewCount", 9] },
                      then: "$$REMOVE",
                      else: "$scores.phantom",
                    },
                  },
                },
                activities: 1,
              },
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
          place: { $arrayElemAt: ["$place", 0] },
          writer: { $arrayElemAt: ["$writer", 0] },
          media: 1,
          scores: 1,
          tags: 1,
          reactions: { $arrayElemAt: ["$reactions", 0] },
        },
      },
    );

    const reviews = await Review.aggregate(pipeline);

    res.status(StatusCodes.OK).json({ success: true, data: reviews });
  } catch (err) {
    next(err);
  }
}
