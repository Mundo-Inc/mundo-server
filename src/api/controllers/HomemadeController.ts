import type { NextFunction, Request, Response } from "express";
import { body, param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose, { type PipelineStage } from "mongoose";

import { ResourceTypeEnum } from "../../models/Enum/ResourceTypeEnum.js";
import Follow from "../../models/Follow.js";
import Homemade from "../../models/Homemade.js";
import Media, { MediaTypeEnum } from "../../models/Media.js";
import Notification, {
  NotificationTypeEnum,
} from "../../models/Notification.js";
import Upload from "../../models/Upload.js";
import User from "../../models/User.js";
import { ResourcePrivacyEnum } from "../../models/UserActivity.js";
import strings, { dStrings as ds, dynamicMessage } from "../../strings.js";
import {
  createError,
  handleInputErrors,
} from "../../utilities/errorHandlers.js";
import { getPaginationFromQuery } from "../../utilities/pagination.js";
import MediaProjection from "../dto/media.js";
import UserProjection from "../dto/user.js";
import { UserActivityManager } from "../services/UserActivityManager.js";
import logger from "../services/logger/index.js";
import { addReward } from "../services/reward/reward.service.js";
import validate from "./validators.js";

export const getHomemadePostsValidation: ValidationChain[] = [
  query("user").optional().isMongoId(),
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

    const authUser = req.user!;

    const { sort }: { sort?: "newest" | "oldest" } = req.query;

    const user = req.query.user
      ? new mongoose.Types.ObjectId(req.query.user as string)
      : null;

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
  body("media").isArray({ min: 1 }),
  body("media.*.uploadId").isMongoId(),
  body("media.*.caption").optional().isString(),
  body("tags").optional().isArray(),
  body("tags.*").optional().isMongoId(),
  body("privacyType")
    .optional()
    .isIn([ResourcePrivacyEnum.Private, ResourcePrivacyEnum.Followers]),
];
export async function createHomemadePost(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const { content, media, tags } = req.body;

    const privacyType = req.body.privacyType
      ? (req.body.privacyType as
          | ResourcePrivacyEnum.Public
          | ResourcePrivacyEnum.Followers)
      : ResourcePrivacyEnum.Public;

    const userId = req.body.user
      ? new mongoose.Types.ObjectId(req.body.user as string)
      : authUser._id;

    if (!userId.equals(authUser._id) && authUser.role !== "admin") {
      throw createError(strings.authorization.otherUser, StatusCodes.FORBIDDEN);
    }

    const uploadIds: mongoose.Types.ObjectId[] = [];
    const mediaIds: mongoose.Types.ObjectId[] = [];

    for (const m of media) {
      const upload = await Upload.findById(m.uploadId).orFail(
        createError(
          dynamicMessage(ds.notFound, "Uploaded media"),
          StatusCodes.NOT_FOUND
        )
      );
      if (!authUser._id.equals(upload.user)) {
        throw createError(
          strings.authorization.otherUser,
          StatusCodes.FORBIDDEN
        );
      }
      uploadIds.push(m.uploadId);

      await Media.create({
        type:
          upload.type === "video" ? MediaTypeEnum.Video : MediaTypeEnum.Image,
        user: authUser._id,
        caption: m.caption,
        src: upload.src,
      }).then(async (media) => {
        mediaIds.push(media._id);
        await Upload.findByIdAndDelete(m.uploadId);
      });
    }

    if (mediaIds.length === 0) {
      throw createError(
        "At least one media (img/vid) should be included",
        StatusCodes.BAD_REQUEST
      );
    }

    if (tags) {
      logger.verbose("validate tags");
      for (const userId of tags) {
        await User.exists({ _id: userId }).orFail(
          createError("Tagged user does not exist", StatusCodes.NOT_FOUND)
        );
      }
    }

    const homemade = await Homemade.create({
      user: userId,
      content: content || "",
      media: mediaIds,
      tags,
      privacyType: privacyType,
    });

    const reward = await addReward(authUser._id, {
      refType: "Homemade",
      refId: homemade._id,
    });

    //Send notifications to followers
    const followers = await Follow.find({
      target: userId,
    }).lean();

    for (const follower of followers) {
      await Notification.create({
        user: follower.user,
        type: NotificationTypeEnum.FollowingHomemade,
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

    try {
      //TODO: ADD COIN REWARDS TO THE USERS IF APPROVED BY NABZ
      // await reviewEarning(authId, review);
      // const _act = await addHomemadeActivity(authUser._id, homemade._id);
      const activity = await UserActivityManager.createHomemadeActivity(
        authUser,
        homemade._id
      );
      homemade.userActivityId = activity._id;
      await homemade.save();
    } catch (e) {
      logger.error("Internal server error during creating the review", {
        error: e,
      });
    }
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

    const authUser = req.user!;

    const id = new mongoose.Types.ObjectId(req.params.id);

    const post = await Homemade.aggregate([
      {
        $match: {
          _id: id,
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
    ]).then((res) => res[0]);

    if (!post) {
      throw createError(
        dynamicMessage(ds.notFound, "Post"),
        StatusCodes.NOT_FOUND
      );
    }

    res.status(StatusCodes.OK).json({ success: true, data: post });
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

    const authUser = req.user!;

    const id = new mongoose.Types.ObjectId(req.params.id);

    const homemade = await Homemade.findById(id).orFail(
      createError(dynamicMessage(ds.notFound, "Post"), StatusCodes.NOT_FOUND)
    );

    if (!authUser._id.equals(homemade.user)) {
      throw createError(strings.authorization.otherUser, StatusCodes.FORBIDDEN);
    }

    await homemade.deleteOne();

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}

// TODO: By adding Edit Homemade API make sure to consider updating hasMedia field of the activity if the homemade has media or not
