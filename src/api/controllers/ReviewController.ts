import type { NextFunction, Request, Response } from "express";
import { body, param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";

import mongoose from "mongoose";
import Place from "../../models/Place";
import strings, { dStrings as ds, dynamicMessage } from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import Review from "../../models/Review";
import validate from "./validators";
import { reviewEarning } from "../services/earning.service";
import {
  addRecommendActivity,
  addReviewActivity,
} from "../services/user.activity.service";
import { openAiAnalyzeReview } from "../../utilities/openAi";
import Upload from "../../models/Upload";
import Media, { MediaTypeEnum } from "../../models/Media";
import { addReward } from "../services/reward/reward.service";
import { publicReadUserProjectionAG } from "../dto/user/read-user-public.dto";
import User from "../../models/User";
import logger from "../services/logger";

export const getReviewsValidation: ValidationChain[] = [
  query("writer").optional().isMongoId(),
  query("sort").optional().isIn(["newest", "oldest"]),
  validate.page(query("page").optional(), 100),
  validate.limit(query("limit").optional(), 1, 50),
];
export async function getReviews(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: authId } = req.user!;

    const {
      writer,
      sort,
    }: {
      writer?: string;
      sort?: "newest" | "oldest";
    } = req.query;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let pipeline: any[] = [];

    if (writer) {
      pipeline.push({
        $match: { writer: new mongoose.Types.ObjectId(writer as string) },
      });
    }
    pipeline.push(
      { $sort: { createdAt: sort === "oldest" ? 1 : -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "media",
          localField: "images",
          foreignField: "_id",
          as: "images",
          pipeline: [
            {
              $project: {
                _id: 1,
                src: 1,
                caption: 1,
                type: 1,
              },
            },
          ],
        },
      },
      {
        $lookup: {
          from: "media",
          localField: "videos",
          foreignField: "_id",
          as: "videos",
          pipeline: [
            {
              $project: {
                _id: 1,
                src: 1,
                caption: 1,
                type: 1,
              },
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
                reviewCount: 1,
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
          images: 1,
          videos: 1,
          scores: 1,
          tags: 1,
          reactions: {
            $arrayElemAt: ["$reactions", 0],
          },
        },
      }
    );

    const reviews = await Review.aggregate(pipeline);

    res.status(StatusCodes.OK).json({ success: true, data: reviews });
  } catch (err) {
    next(err);
  }
}

const allowedScoreKeys = [
  "overall",
  "drinkQuality",
  "foodQuality",
  "service",
  "atmosphere",
  "value",
];
export const createReviewValidation: ValidationChain[] = [
  body("place").isMongoId(),
  body("scores").custom((scores) => {
    if (typeof scores !== "object") {
      throw createError(strings.review.invalidScore, StatusCodes.BAD_REQUEST);
    }
    for (const key in scores) {
      if (!allowedScoreKeys.includes(key)) {
        throw createError(
          strings.review.invalidScoreKey,
          StatusCodes.BAD_REQUEST
        );
      }
    }
    return true;
  }),
  body("scores.*")
    .optional()
    .custom((score) => {
      if (score === null) {
        return true;
      } else {
        const scoreNum = parseInt(score);
        if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 5) {
          throw createError(
            strings.review.invalidScoreValue,
            StatusCodes.BAD_REQUEST
          );
        } else {
          return true;
        }
      }
    }),

  body("content").optional().isString(),
  body("images").optional().isArray(),
  body("images.*.uploadId").optional().isMongoId(),
  body("images.*.caption").optional().isString(),
  body("videos").optional().isArray(),
  body("videos.*.uploadId").optional().isMongoId(),
  body("videos.*.caption").optional().isString(),
  body("language").optional().isString(),
  body("recommend").optional().isBoolean(),
];
export async function createReview(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: authId, role } = req.user!;

    const { place, scores, content, images, videos, language, recommend } =
      req.body;

    const writer = req.body.writer || authId;

    if (writer !== authId && role !== "admin") {
      throw createError(strings.authorization.otherUser, StatusCodes.FORBIDDEN);
    }

    const populatedPlace = await Place.findById(place);
    if (!populatedPlace) {
      throw createError(
        dynamicMessage(ds.notFound, "Place"),
        StatusCodes.NOT_FOUND
      );
    }

    if (role !== "admin") {
      const lastReview = await Review.findOne({
        writer,
        place,
        createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });
      if (lastReview) {
        throw createError(
          strings.review.cantReviewSamePlaceWithin24Hours,
          StatusCodes.CONFLICT
        );
      }
    }

    const uploadIds: string[] = [];
    const imageMediaIds: string[] = [];
    const videoMediaIds: string[] = [];
    let hasMedia = false;
    if (images && images.length > 0) {
      hasMedia = true;
      for (const image of images) {
        const upload = await Upload.findById(image.uploadId);
        if (!upload) {
          throw createError(
            dynamicMessage(ds.notFound, "Uploaded image"),
            StatusCodes.NOT_FOUND
          );
        }
        if (upload.user.toString() !== authId) {
          throw createError(
            strings.authorization.otherUser,
            StatusCodes.FORBIDDEN
          );
        }
        if (upload.type !== "image") {
          throw createError(
            strings.upload.invalidType,
            StatusCodes.BAD_REQUEST
          );
        }
        uploadIds.push(image.uploadId);

        await Media.create({
          type: MediaTypeEnum.image,
          user: authId,
          place,
          caption: image.caption,
          src: upload.src,
        }).then(async (media) => {
          imageMediaIds.push(media._id);
          await Upload.findByIdAndDelete(image.uploadId);
        });
      }
    }
    if (videos && videos.length > 0) {
      hasMedia = true;
      for (const video of videos) {
        const upload = await Upload.findById(video.uploadId);
        if (!upload) {
          throw createError(
            dynamicMessage(ds.notFound, "Uploaded video"),
            StatusCodes.NOT_FOUND
          );
        }
        if (upload.user.toString() !== authId) {
          throw createError(
            strings.authorization.otherUser,
            StatusCodes.FORBIDDEN
          );
        }
        if (upload.type !== "video") {
          throw createError(
            strings.upload.invalidType,
            StatusCodes.BAD_REQUEST
          );
        }
        uploadIds.push(video.uploadId);

        await Media.create({
          type: MediaTypeEnum.video,
          user: authId,
          place,
          caption: video.caption,
          src: upload.src,
        }).then(async (media) => {
          videoMediaIds.push(media._id);
          await Upload.findByIdAndDelete(video.uploadId);
        });
      }
    }

    await User.updateOne(
      { _id: authId },
      {
        latestPlace: place,
      }
    );

    const review = await Review.create({
      writer,
      place,
      scores,
      content: content || "",
      images: imageMediaIds,
      videos: videoMediaIds,
      language: language || "en",
      recommend: recommend
        ? recommend === "false"
          ? false
          : Boolean(recommend)
        : undefined,
    });

    const reward = await addReward(authId, {
      refType: "Review",
      refId: review._id,
      placeId: place,
    });

    res
      .status(StatusCodes.CREATED)
      .json({ success: true, data: review, reward });

    try {
      // delete uploads
      await Upload.deleteMany({ _id: { $in: uploadIds } });
    } catch (e) {
      logger.error("Internal server error on deleting upload(s)", { error: e });
    }

    try {
      await reviewEarning(authId, review);
      let _act;
      if (!images && !videos && !content) {
        _act = await addRecommendActivity(authId, review._id, place);
      } else {
        _act = await addReviewActivity(authId, review._id, place, hasMedia);
      }
      if (_act) {
        review.userActivityId = _act._id;
        //TODO: send notification to the follower + nearby users if they haven't seen the post.
        await review.save();
      }
    } catch (e) {
      logger.error("Internal server error during creating the review", {
        error: e,
      });
    }

    if (content && content.length > 8) {
      openAiAnalyzeReview(content).then(async ({ error, scores, tags }) => {
        if (error) {
          // TODO: handle error -> return something to the user!
          logger.error("Error analyzing review", { error });
        }
        review.scores = {
          ...scores,
          ...review.scores,
        };
        review.tags = tags;
        await review.save();
        populatedPlace.processReviews();
      });
    } else {
      populatedPlace.processReviews();
    }
  } catch (err) {
    next(err);
  }
}

export const getReviewValidation: ValidationChain[] = [param("id").isMongoId()];
export async function getReview(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id } = req.params;
    const { id: authId } = req.user!;

    const reviews = await Review.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(id as string),
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
        $lookup: {
          from: "media",
          localField: "images",
          foreignField: "_id",
          as: "images",
          pipeline: [
            {
              $project: {
                _id: 1,
                src: 1,
                caption: 1,
                type: 1,
              },
            },
          ],
        },
      },
      {
        $lookup: {
          from: "media",
          localField: "videos",
          foreignField: "_id",
          as: "videos",
          pipeline: [
            {
              $project: {
                _id: 1,
                src: 1,
                caption: 1,
                type: 1,
              },
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
                reviewCount: 1,
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
          images: 1,
          videos: 1,
          scores: 1,
          tags: 1,
          reactions: {
            $arrayElemAt: ["$reactions", 0],
          },
        },
      },
    ]);

    if (reviews.length === 0) {
      throw createError(
        dynamicMessage(ds.notFound, "Review"),
        StatusCodes.NOT_FOUND
      );
    }

    res.status(StatusCodes.OK).json({ success: true, data: reviews[0] });
  } catch (err) {
    next(err);
  }
}

// TODO: By adding Edit Review API make sure to consider updating hasMedia field of the activity if the review has media or not
