import type { NextFunction, Request, Response } from "express";
import { body, param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose, { type PipelineStage } from "mongoose";

import { ResourceTypeEnum } from "../../models/Enum/ResourceTypeEnum.js";
import Follow from "../../models/Follow.js";
import Media, { type IMedia } from "../../models/Media.js";
import Notification, {
  NotificationTypeEnum,
} from "../../models/Notification.js";
import Place from "../../models/Place.js";
import Review from "../../models/Review.js";
import ScheduledTask, {
  ScheduledTaskStatus,
  ScheduledTaskType,
} from "../../models/ScheduledTask.js";
import Upload from "../../models/Upload.js";
import User from "../../models/User.js";
import { ResourcePrivacyEnum } from "../../models/UserActivity.js";
import strings, { dStrings as ds, dynamicMessage } from "../../strings.js";
import { getRandomDateInRange } from "../../utilities/dateTime.js";
import {
  createError,
  handleInputErrors,
} from "../../utilities/errorHandlers.js";
import { shouldBotInteract } from "../../utilities/mundo.js";
import { openAiAnalyzeReview } from "../../utilities/openAi.js";
import { getPaginationFromQuery } from "../../utilities/pagination.js";
import MediaProjection from "../dto/media.js";
import UserProjection from "../dto/user.js";
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

  body("content").optional().isString().trim(),

  // @deprecated - Use `media` instead
  body("images").optional().isArray(),
  body("images.*.uploadId").optional().isMongoId(),
  body("images.*.caption").optional().isString(),
  body("videos").optional().isArray(),
  body("videos.*.uploadId").optional().isMongoId(),
  body("videos.*.caption").optional().isString(),

  body("media").optional().isArray(),
  body("media.*.uploadId").optional().isMongoId(),
  body("media.*.caption").optional().isString(),
  body("language").optional().isString(),
  body("recommend").optional().isBoolean().toBoolean(),
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

    const { scores, language } = req.body;

    const content = req.body.content ? (req.body.content as string) : "";
    const recommend = req.body.recommend as boolean | undefined;
    const media = req.body.media
      ? (req.body.media as Array<{ uploadId: string; caption: string }>).map(
          ({ uploadId, caption }) => ({
            uploadId: new mongoose.Types.ObjectId(uploadId),
            caption,
          })
        )
      : [
          ...((req.body.videos as Array<{
            uploadId: string;
            caption: string;
          }>) || []),
          ...((req.body.images as Array<{
            uploadId: string;
            caption: string;
          }>) || []),
        ].map(({ uploadId, caption }) => ({
          uploadId: new mongoose.Types.ObjectId(uploadId),
          caption,
        }));

    const placeId = new mongoose.Types.ObjectId(req.body.place as string);
    const privacyType = req.body.privacyType
      ? (req.body.privacyType as ResourcePrivacyEnum)
      : ResourcePrivacyEnum.Public;

    const writer = req.body.writer
      ? new mongoose.Types.ObjectId(req.body.writer as string)
      : authUser._id;

    if (!authUser._id.equals(writer) && authUser.role !== "admin") {
      throw createError(strings.authorization.otherUser, StatusCodes.FORBIDDEN);
    }

    const place = await Place.findById(placeId).orFail(
      createError(dynamicMessage(ds.notFound, "Place"), StatusCodes.NOT_FOUND)
    );

    if (authUser.role !== "admin") {
      const lastReviewExists = await Review.exists({
        writer,
        place: placeId,
        createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });

      if (lastReviewExists) {
        throw createError(
          "You can't review the same place within 24 hours",
          StatusCodes.CONFLICT
        );
      }
    }

    const uploadIds: mongoose.Types.ObjectId[] = [];
    const mediaDocs: IMedia[] = [];
    if (media) {
      for (const m of media) {
        const upload = await Upload.findById(m.uploadId)
          .orFail(
            createError(
              dynamicMessage(ds.notFound, `Upload ${m.uploadId}`),
              StatusCodes.NOT_FOUND
            )
          )
          .lean();

        if (!authUser._id.equals(upload.user)) {
          throw createError(
            strings.authorization.otherUser,
            StatusCodes.FORBIDDEN
          );
        }

        uploadIds.push(m.uploadId);

        const media = await Media.create({
          type: upload.type,
          user: authUser._id,
          place: placeId,
          caption: m.caption,
          src: upload.src,
        });

        mediaDocs.push(media);
        await Upload.findByIdAndDelete(m.uploadId);
      }
    }

    const review = await Review.create({
      writer,
      place: placeId,
      scores,
      content: content || "",
      language: language || "en",
      recommend: recommend,
      privacyType: privacyType,
      ...(mediaDocs.length < 0 ? {} : { media: mediaDocs.map((m) => m._id) }),
    });

    const reward = await addReward(authUser._id, {
      refType: "Review",
      refId: review._id,
      placeId: placeId,
    });

    res
      .status(StatusCodes.CREATED)
      .json({ success: true, data: review, reward });

    place.activities.reviewCount += 1;
    await place.save();

    await User.updateOne({ _id: authUser._id }, { latestPlace: placeId });

    //Send notifications to followers
    const followers = await Follow.find({
      target: writer,
    }).lean();
    await Promise.all(
      followers.map((follower) =>
        Notification.create({
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
        })
      )
    );

    try {
      await reviewEarning(authUser._id, review._id, mediaDocs);
      let activity;
      if (media.length == 0 && !content) {
        // activity = await addRecommendActivity(authUser._id, review._id, place);
        activity = await UserActivityManager.createRecommendedActivity(
          authUser,
          placeId,
          review._id
        );
      } else {
        activity = await UserActivityManager.createReviewActivity(
          authUser,
          placeId,
          media.length > 0,
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
        place.processReviews();
      });
    } else {
      place.processReviews();
    }

    // AI Comment
    if (await shouldBotInteract(writer)) {
      await ScheduledTask.create({
        status: ScheduledTaskStatus.Pending,
        type: ScheduledTaskType.CommentOnActivity,
        resourceId: review.userActivityId,
        scheduledAt: getRandomDateInRange(60 * 60 * 3, 60 * 5),
      });
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
    ]).then((review) => review[0]);

    if (!reviews) {
      throw createError(
        dynamicMessage(ds.notFound, "Review"),
        StatusCodes.NOT_FOUND
      );
    }

    res.status(StatusCodes.OK).json({ success: true, data: reviews });
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
