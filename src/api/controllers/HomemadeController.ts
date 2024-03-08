import type { NextFunction, Request, Response } from "express";
import { body, param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import Follow from "../../models/Follow";
import Media, { MediaTypeEnum } from "../../models/Media";
import Notification, {
  NotificationTypeEnum,
  ResourceTypeEnum,
} from "../../models/Notification";
import Upload from "../../models/Upload";
import User from "../../models/User";
import strings, { dStrings as ds, dynamicMessage } from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { publicReadUserEssentialProjection } from "../dto/user/read-user-public.dto";
import { reviewEarning } from "../services/earning.service";
import logger from "../services/logger";
import { addReward } from "../services/reward/reward.service";
import {
  addRecommendActivity,
  addReviewActivity,
} from "../services/user.activity.service";
import validate from "./validators";
import Homemade, { IHomemade } from "../../models/Homemade";

export const getHomemadePostsValidation: ValidationChain[] = [
  query("userId").optional().isMongoId(),
  query("sort").optional().isIn(["newest", "oldest"]),
  validate.page(query("page").optional(), 100),
  validate.limit(query("limit").optional(), 1, 50),
];
export async function getHomemadePosts(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: authId } = req.user!;

    const {
      userId,
      sort,
    }: {
      userId?: string;
      sort?: "newest" | "oldest";
    } = req.query;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let pipeline: any[] = [];

    if (userId) {
      pipeline.push({
        $match: { userId: new mongoose.Types.ObjectId(userId as string) },
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
          localField: "userId",
          foreignField: "_id",
          as: "user",
          pipeline: [
            {
              $project: publicReadUserEssentialProjection,
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
          user: { $arrayElemAt: ["$user", 0] },
          images: 1,
          videos: 1,
          reactions: {
            $arrayElemAt: ["$reactions", 0],
          },
        },
      }
    );

    const homemades = await Homemade.aggregate(pipeline);

    res.status(StatusCodes.OK).json({ success: true, data: homemades });
  } catch (err) {
    next(err);
  }
}

export const createHomemadeValidationPost: ValidationChain[] = [
  body("content").optional().isString(),
  body("images").optional().isArray(),
  body("images.*.uploadId").optional().isMongoId(),
  body("images.*.caption").optional().isString(),
  body("videos").optional().isArray(),
  body("videos.*.uploadId").optional().isMongoId(),
  body("videos.*.caption").optional().isString(),
];
export async function createHomemadePost(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: authId, role } = req.user!;

    const { content, images, videos } = req.body;

    const userId = req.body.userId || authId;

    if (userId !== authId && role !== "admin") {
      throw createError(strings.authorization.otherUser, StatusCodes.FORBIDDEN);
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
          caption: video.caption,
          src: upload.src,
        }).then(async (media) => {
          videoMediaIds.push(media._id);
          await Upload.findByIdAndDelete(video.uploadId);
        });
      }
    }

    const homemade = await Homemade.create({
      userId,
      content: content || "",
      images: imageMediaIds,
      videos: videoMediaIds,
    });

    const reward = null;
    //TODO: ADD REWARD FOR HOMEMADES
    /*
    const reward = await addReward(authId, {
      refType: "Review",
      refId: review._id,
      placeId: place,
    });
    */

    //Send notifications to followers
    const followers = await Follow.find({
      target: userId,
    }).lean();
    for (const follower of followers) {
      await Notification.create({
        user: follower.user,
        type: NotificationTypeEnum.FOLLOWING_HOMEMADE,
        resources: [
          {
            _id: homemade._id,
            type: ResourceTypeEnum.Homemade,
            date: homemade.createdAt,
          },
        ],
        importance: 2,
      });
    }

    res
      .status(StatusCodes.CREATED)
      .json({ success: true, data: homemade, reward });

    try {
      // delete uploads
      await Upload.deleteMany({ _id: { $in: uploadIds } });
    } catch (e) {
      logger.error("Internal server error on deleting upload(s)", { error: e });
    }

    //TODO: ADD COIN REWARDS TO THE USERS IF APPROVED BY NABZ
    /*
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
        await review.save();
      }
    } catch (e) {
      logger.error("Internal server error during creating the review", {
        error: e,
      });
    }
    */
  } catch (err) {
    next(err);
  }
}

export const getHomemadePostValidation: ValidationChain[] = [
  param("id").isMongoId(),
];
export async function getHomemadePost(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id } = req.params;
    const { id: authId } = req.user!;

    const homemades = await Homemade.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(id as string),
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
          pipeline: [
            {
              $project: publicReadUserEssentialProjection,
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
          user: { $arrayElemAt: ["$user", 0] },
          images: 1,
          videos: 1,
          reactions: {
            $arrayElemAt: ["$reactions", 0],
          },
        },
      },
    ]);

    if (homemades.length === 0) {
      throw createError(
        dynamicMessage(ds.notFound, "Post"),
        StatusCodes.NOT_FOUND
      );
    }

    res.status(StatusCodes.OK).json({ success: true, data: homemades[0] });
  } catch (err) {
    next(err);
  }
}

export const removeHomemadePostValidation: ValidationChain[] = [
  param("id").isMongoId(),
];
export async function removeHomemadePost(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id } = req.params;
    const { id: authId } = req.user!;

    const homemade: IHomemade | null = await Homemade.findById(id);

    if (!homemade) {
      throw createError(
        dynamicMessage(ds.notFound, "Post"),
        StatusCodes.NOT_FOUND
      );
    }

    if (homemade.userId.toString() !== authId) {
      throw createError(strings.authorization.otherUser, StatusCodes.FORBIDDEN);
    }

    await homemade.deleteOne();

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}

// TODO: By adding Edit Homemade API make sure to consider updating hasMedia field of the activity if the homemade has media or not
