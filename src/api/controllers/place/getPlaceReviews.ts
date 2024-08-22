import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import type { PipelineStage } from "mongoose";
import { z } from "zod";

import type { MediaProjectionBrief } from "../../../api/dto/media.js";
import MediaProjection from "../../../api/dto/media.js";
import { UserProjection } from "../../../api/dto/user.js";
import { getYelpReviews } from "../../../api/services/provider.service.js";
import type {
  GooglePlaceDetailsPreferred,
  GooglePlaceReview,
} from "../../../dataManagers/googleDataManager.js";
import {
  GoogleDataManager,
  GooglePlaceFields,
} from "../../../dataManagers/googleDataManager.js";
import { MediaTypeEnum } from "../../../models/media.js";
import Place from "../../../models/place.js";
import Review from "../../../models/review.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { getPaginationFromQuery } from "../../../utilities/pagination.js";
import { createResponse } from "../../../utilities/response.js";
import {
  validateData,
  zObjectId,
  zPaginationSpread,
} from "../../../utilities/validation.js";

const params = z.object({
  placeId: zObjectId,
});
const query = z.object({
  ...zPaginationSpread,
  type: z
    .enum(["phantom", "googlePlaces", "yelp"])
    .optional()
    .default("phantom"),
});

type Params = z.infer<typeof params>;
type Query = z.infer<typeof query>;

export const getPlaceReviewsValidation = validateData({
  params: params,
  query: query,
});

export async function getPlaceReviews(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user;

    const { placeId } = req.params as unknown as Params;
    const { type } = req.query as unknown as Query;

    if (type === "googlePlaces") {
      const place = await Place.findById(placeId)
        .orFail(
          createError(
            dynamicMessage(ds.notFound, "Place"),
            StatusCodes.NOT_FOUND,
          ),
        )
        .lean();

      let reviews: GooglePlaceReview[] = [];

      if (place.otherSources?.googlePlaces?._id) {
        const googleData =
          await GoogleDataManager.getPlaceDetails<GooglePlaceDetailsPreferred>(
            place.otherSources.googlePlaces._id,
            [GooglePlaceFields.PREFERRED],
          );
        if (googleData.reviews) {
          reviews = googleData.reviews;
        }
      }

      res.status(StatusCodes.OK).json(createResponse(reviews));
    } else if (type === "yelp") {
      const place = await Place.findById(placeId)
        .orFail(
          createError(
            dynamicMessage(ds.notFound, "Place"),
            StatusCodes.NOT_FOUND,
          ),
        )
        .lean();

      let reviews = [];

      if (place.otherSources?.yelp?._id) {
        reviews = await getYelpReviews(place.otherSources.yelp._id);
      }

      res.status(StatusCodes.OK).json(createResponse(reviews));
    } else {
      const { page, limit, skip } = getPaginationFromQuery(req, {
        defaultLimit: 20,
        maxLimit: 30,
      });

      let userReactionPipeline: Record<string, PipelineStage[]> = {};
      if (authUser) {
        userReactionPipeline = {
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
        };
      }

      const total = await Review.countDocuments({
        place: placeId,
      });

      const results = await Review.aggregate([
        {
          $match: {
            place: placeId,
          },
        },
        {
          $match: {
            content: { $exists: true, $ne: "" },
          },
        },
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
                  ...userReactionPipeline,
                },
              },
            ],
          },
        },
        {
          $lookup: {
            from: "comments",
            localField: "userActivityId",
            foreignField: "userActivity",
            as: "comments",
            pipeline: [
              {
                $match: {
                  status: "active",
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
                  ...(authUser
                    ? {
                        liked: {
                          $in: [authUser._id, "$likes"],
                        },
                      }
                    : {}),
                },
              },
            ],
          },
        },
        {
          $project: {
            scores: 1,
            content: 1,
            media: 1,
            tags: 1,
            language: 1,
            recommend: 1,
            createdAt: 1,
            updatedAt: 1,
            userActivityId: 1,
            writer: { $arrayElemAt: ["$writer", 0] },
            reactions: { $arrayElemAt: ["$reactions", 0] },
            comments: 1,
          },
        },
      ]);

      // TODO: remove this temporary fix
      for (const review of results) {
        review.images = review.media?.filter(
          (media: MediaProjectionBrief) => media.type === MediaTypeEnum.Image,
        );
        review.videos = review.media?.filter(
          (media: MediaProjectionBrief) => media.type === MediaTypeEnum.Video,
        );
      }

      res.status(StatusCodes.OK).json(
        createResponse(results || [], {
          totalCount: total,
          page,
          limit,
        }),
      );
    }
  } catch (err) {
    next(err);
  }
}
