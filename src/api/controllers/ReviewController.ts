import type { NextFunction, Request, Response } from "express";
import { body, param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose, { type PipelineStage } from "mongoose";

import { env } from "../../env.js";
import Comment from "../../models/Comment.js";
import { ResourceTypeEnum } from "../../models/Enum/ResourceTypeEnum.js";
import Follow from "../../models/Follow.js";
import Media, { MediaTypeEnum } from "../../models/Media.js";
import Notification, {
  NotificationTypeEnum,
} from "../../models/Notification.js";
import Place from "../../models/Place.js";
import Review from "../../models/Review.js";
import Upload from "../../models/Upload.js";
import User from "../../models/User.js";
import UserActivity, {
  ResourcePrivacyEnum,
} from "../../models/UserActivity.js";
import strings, { dStrings as ds, dynamicMessage } from "../../strings.js";
import {
  createError,
  handleInputErrors,
} from "../../utilities/errorHandlers.js";
import { openAiAnalyzeReview } from "../../utilities/openAi.js";
import { getPaginationFromQuery } from "../../utilities/pagination.js";
import UserProjection from "../dto/user.js";
import { OpenAIService } from "../services/OpenAIService.js";
import { UserActivityManager } from "../services/UserActivityManager.js";
import { reviewEarning } from "../services/earning.service.js";
import logger from "../services/logger/index.js";
import { addReward } from "../services/reward/reward.service.js";
import validate from "./validators.js";

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

    const authUser = req.user!;

    const writer = req.query.writer
      ? new mongoose.Types.ObjectId(req.query.writer as string)
      : undefined;
    const sort = (req.query.sort as "newest" | "oldest") || "newest";

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
  body("privacyType").optional().isIn(Object.values(ResourcePrivacyEnum)),
];
export async function createReview(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const { scores, content, images, videos, language, recommend } = req.body;
    const place = new mongoose.Types.ObjectId(req.body.place as string);
    const privacyType = req.body.privacyType
      ? (req.body.privacyType as ResourcePrivacyEnum)
      : ResourcePrivacyEnum.Public;

    const writer = req.body.writer
      ? new mongoose.Types.ObjectId(req.body.writer as string)
      : authUser._id;

    if (!authUser._id.equals(writer) && authUser.role !== "admin") {
      throw createError(strings.authorization.otherUser, StatusCodes.FORBIDDEN);
    }

    const populatedPlace = await Place.findById(place);
    if (!populatedPlace) {
      throw createError(
        dynamicMessage(ds.notFound, "Place"),
        StatusCodes.NOT_FOUND
      );
    }

    if (authUser.role !== "admin") {
      const lastReview = await Review.findOne({
        writer,
        place,
        createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });
      if (lastReview) {
        throw createError(
          "You can't review the same place within 24 hours",
          StatusCodes.CONFLICT
        );
      }
    }

    const uploadIds: mongoose.Types.ObjectId[] = [];
    const imageMediaIds: mongoose.Types.ObjectId[] = [];
    const videoMediaIds: mongoose.Types.ObjectId[] = [];
    let hasMedia = false;
    if (images && images.length > 0) {
      hasMedia = true;
      for (const image of images) {
        const upload = await Upload.findById(image.uploadId).orFail(
          createError(
            dynamicMessage(ds.notFound, "Uploaded image"),
            StatusCodes.NOT_FOUND
          )
        );

        if (!authUser._id.equals(upload.user)) {
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

        const media = await Media.create({
          type: MediaTypeEnum.Image,
          user: authUser._id,
          place,
          caption: image.caption,
          src: upload.src,
        });

        imageMediaIds.push(media._id);
        await Upload.findByIdAndDelete(image.uploadId);
      }
    }
    if (videos && videos.length > 0) {
      hasMedia = true;
      for (const video of videos) {
        const upload = await Upload.findById(video.uploadId).orFail(
          createError(
            dynamicMessage(ds.notFound, "Uploaded video"),
            StatusCodes.NOT_FOUND
          )
        );

        if (!authUser._id.equals(upload.user)) {
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

        const media = await Media.create({
          type: MediaTypeEnum.Video,
          user: authUser._id,
          place,
          caption: video.caption,
          src: upload.src,
        });

        videoMediaIds.push(media._id);
        await Upload.findByIdAndDelete(video.uploadId);
      }
    }

    await User.updateOne(
      { _id: authUser._id },
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
      privacyType: privacyType,
    });

    logger.verbose("adding review count to the place");
    populatedPlace.activities.reviewCount += 1;
    await populatedPlace.save();

    const reward = await addReward(authUser._id, {
      refType: "Review",
      refId: review._id,
      placeId: place,
    });

    //Send notifications to followers
    const followers = await Follow.find({
      target: writer,
    }).lean();
    for (const follower of followers) {
      await Notification.create({
        user: follower.user,
        type: NotificationTypeEnum.FollowingReview,
        resources: [
          {
            _id: review._id,
            type: ResourceTypeEnum.Review,
            date: review.createdAt,
          },
        ],
        importance: 2,
      });
    }

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
      await reviewEarning(authUser._id, review);
      let activity;
      if (!images && !videos && !content) {
        // activity = await addRecommendActivity(authUser._id, review._id, place);
        activity = await UserActivityManager.createRecommendedActivity(
          authUser,
          place,
          review._id
        );
      } else {
        activity = await UserActivityManager.createReviewActivity(
          authUser,
          place,
          hasMedia,
          review._id
        );
      }
      if (activity) {
        review.userActivityId = activity._id;
        //TODO: send notification to the follower + nearby users if they haven't seen the post.
        await review.save();
      }
    } catch (e) {
      logger.error("Internal server error during creating the review", {
        error: e,
      });
    }

    if (content && content.length > 8) {
      openAiAnalyzeReview(content).then(async ({ error, tags }) => {
        if (error) {
          logger.error("Error analyzing review with OpenAI", { error });
        }
        review.tags = tags;
        await review.save();
        populatedPlace.processReviews();
      });
    } else {
      populatedPlace.processReviews();
    }

    // AI Comment
    const cmBody = await OpenAIService.getInstance().makeACommentOnReview(
      review
    );

    if (cmBody && cmBody !== "-") {
      // Create comment
      await Comment.create({
        author: env.MUNDO_USER_ID,
        userActivity: review.userActivityId,
        content: cmBody,
      });

      // update comments count in user activity
      await UserActivity.updateOne(
        { _id: review.userActivityId },
        { $inc: { "engagements.comments": 1 } }
      );
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

    const authUser = req.user!;

    const id = new mongoose.Types.ObjectId(req.params.id);

    const reviews = await Review.aggregate([
      {
        $match: {
          _id: id,
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

export const removeReviewValidation: ValidationChain[] = [
  param("id").isMongoId(),
];
export async function removeReview(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const id = new mongoose.Types.ObjectId(req.params.id);

    const review = await Review.findById(id).orFail(
      createError(dynamicMessage(ds.notFound, "Review"), StatusCodes.NOT_FOUND)
    );

    if (!authUser._id.equals(review.writer)) {
      throw createError(strings.authorization.otherUser, StatusCodes.FORBIDDEN);
    }

    await review.deleteOne();

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}

// TODO: By adding Edit Review API make sure to consider updating hasMedia field of the activity if the review has media or not
