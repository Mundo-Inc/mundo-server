import type { NextFunction, Request, Response } from "express";
import { body, param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import Follow from "../../models/Follow";
import Homemade, { IHomemade } from "../../models/Homemade";
import Media, { MediaTypeEnum } from "../../models/Media";
import Notification, {
  NotificationTypeEnum,
  ResourceTypeEnum,
} from "../../models/Notification";
import Upload from "../../models/Upload";
import User from "../../models/User";
import { ActivityPrivacyTypeEnum } from "../../models/UserActivity";
import strings, { dStrings as ds, dynamicMessage } from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import UserProjection from "../dto/user/user";
import logger from "../services/logger";
import { addReward } from "../services/reward/reward.service";
import { addHomemadeActivity } from "../services/user.activity.service";
import validate from "./validators";

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

    const { id: authId } = req.user!;

    const {
      user,
      sort,
    }: {
      user?: string;
      sort?: "newest" | "oldest";
    } = req.query;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const pipeline: any[] = [];

    if (user) {
      pipeline.push({
        $match: { user: new mongoose.Types.ObjectId(user as string) },
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
          media: 1,
          tags: 1,
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
  body("media").isArray({ min: 1 }),
  body("media.*.uploadId").isMongoId(),
  body("media.*.caption").optional().isString(),
  body("tags").optional().isArray(),
  body("tags.*").optional().isMongoId(),
  body("privacyType")
    .optional()
    .isIn([ActivityPrivacyTypeEnum.PUBLIC, ActivityPrivacyTypeEnum.FOLLOWING]),
];
export async function createHomemadePost(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: authId, role } = req.user!;

    const { content, media, tags, privacyType } = req.body;

    const userId = req.body.user || authId;

    if (userId !== authId && role !== "admin") {
      throw createError(strings.authorization.otherUser, StatusCodes.FORBIDDEN);
    }

    const uploadIds: string[] = [];
    const mediaIds: string[] = [];

    for (const m of media) {
      const upload = await Upload.findById(m.uploadId);
      if (!upload) {
        throw createError(
          dynamicMessage(ds.notFound, "Uploaded media"),
          StatusCodes.NOT_FOUND
        );
      }
      if (upload.user.toString() !== authId) {
        throw createError(
          strings.authorization.otherUser,
          StatusCodes.FORBIDDEN
        );
      }
      uploadIds.push(m.uploadId);

      await Media.create({
        type:
          upload.type === "video" ? MediaTypeEnum.video : MediaTypeEnum.image,
        user: authId,
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

    logger.verbose("validate tags");
    if (tags) {
      for (const userId of tags) {
        const taggedUser = await User.exists({ _id: userId });
        if (!taggedUser) {
          throw createError(
            "Tagged user does not exist",
            StatusCodes.NOT_FOUND
          );
        }
      }
    }

    const homemade = await Homemade.create({
      user: userId,
      content: content || "",
      media: mediaIds,
      tags,
      privacyType: privacyType || ActivityPrivacyTypeEnum.PUBLIC,
    });

    const reward = await addReward(authId, {
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

    try {
      //TODO: ADD COIN REWARDS TO THE USERS IF APPROVED BY NABZ
      // await reviewEarning(authId, review);
      let _act = await addHomemadeActivity(authId, homemade._id);
      if (_act) {
        homemade.userActivityId = _act._id;
        await homemade.save();
      }
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
          media: 1,
          tags: 1,
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

    if (homemade.user.toString() !== authId) {
      throw createError(strings.authorization.otherUser, StatusCodes.FORBIDDEN);
    }

    await homemade.deleteOne();

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}

// TODO: By adding Edit Homemade API make sure to consider updating hasMedia field of the activity if the homemade has media or not
