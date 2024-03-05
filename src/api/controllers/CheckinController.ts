import type { NextFunction, Request, Response } from "express";
import { body, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import CheckIn, { type ICheckIn } from "../../models/CheckIn";
import Follow from "../../models/Follow";
import Media, { MediaTypeEnum } from "../../models/Media";
import Notification, {
  NotificationTypeEnum,
  ResourceTypeEnum,
} from "../../models/Notification";
import Place from "../../models/Place";
import Upload from "../../models/Upload";
import User, { type IUser } from "../../models/User";
import { ActivityPrivacyTypeEnum } from "../../models/UserActivity";
import strings, { dStrings, dynamicMessage } from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { readFormattedPlaceLocationProjection } from "../dto/place/place-dto";
import { readPlaceBriefProjection } from "../dto/place/read-place-brief.dto";
import { publicReadUserEssentialProjection } from "../dto/user/read-user-public.dto";
import { checkinEarning } from "../services/earning.service";
import logger from "../services/logger";
import { addReward } from "../services/reward/reward.service";
import { addCheckinActivity } from "../services/user.activity.service";
import validate from "./validators";

const checkinWaitTime = 1; // minutes

export const getCheckinsValidation: ValidationChain[] = [
  query("user").optional().isMongoId().withMessage("Invalid user id"),
  query("place").optional().isMongoId().withMessage("Invalid place id"),
  validate.page(query("page").optional(), 50),
  validate.limit(query("limit").optional(), 1, 50),
  query("count").optional().isBoolean().withMessage("Invalid count"),
];
/**
 * @query user    string      |     to get checkins of a user
 * @query place   string      |     to get checkins of a place
 * @query page    number      |     page
 * @query limit   number      |     limit
 * @query count   boolean     |     count
 */
export async function getCheckins(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: userId } = req.user!;

    const { user, place, page: reqPage, limit: reqLimit } = req.query;
    const page = parseInt(reqPage as string) || 1;
    const limit = parseInt(reqLimit as string) || 500;
    const skip = (page - 1) * limit;
    const matchPipeline: any[] = [];
    if (user) {
      //PRIVACY
      const userObject = (await User.findById(user)) as IUser;
      if (userObject) {
        const isFollowed = await Follow.countDocuments({
          user: userId,
          target: userObject._id,
        });
        if (!isFollowed && userObject.isPrivate) {
          throw createError("UNAUTHORIZED", StatusCodes.UNAUTHORIZED);
        }
      }
      matchPipeline.push({
        $match: { user: new mongoose.Types.ObjectId(user as string) },
      });
    } else {
      matchPipeline.push({
        $match: { user: new mongoose.Types.ObjectId(userId) },
      });
    }
    if (place) {
      // TODO: Add privacy check here
      matchPipeline.push({
        $match: { place: new mongoose.Types.ObjectId(place as string) },
      });
    }

    const checkins = await CheckIn.aggregate([
      ...matchPipeline,
      {
        $facet: {
          total: [
            {
              $count: "total",
            },
          ],
          checkins: [
            {
              $sort: { createdAt: -1 },
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
                localField: "user",
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
                from: "places",
                localField: "place",
                foreignField: "_id",
                as: "place",
                pipeline: [
                  {
                    $project: {
                      ...readPlaceBriefProjection,
                      location: readFormattedPlaceLocationProjection,
                    },
                  },
                ],
              },
            },
            {
              $lookup: {
                from: "media",
                localField: "image",
                foreignField: "_id",
                as: "image",
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
                as: "taggedUsers",
                pipeline: [
                  {
                    $project: publicReadUserEssentialProjection,
                  },
                ],
              },
            },
            {
              $unwind: {
                path: "$image",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $unwind: "$user",
            },
            {
              $unwind: "$place",
            },
            {
              $project: {
                _id: 1,
                createdAt: 1,
                user: 1,
                place: 1,
                caption: 1,
                image: 1,
                tags: "$taggedUsers",
              },
            },
          ],
        },
      },
    ]);

    const resData: {
      data: any;
      total?: number;
    } = {
      data: checkins[0].checkins,
      total: checkins[0].total[0]?.total || 0,
    };

    res.status(StatusCodes.OK).json({ success: true, ...resData });
  } catch (err) {
    next(err);
  }
}

async function enforceCheckinInterval(authId: string, authRole: string) {
  if (authRole !== "admin") {
    const lastCheckIn = await CheckIn.findOne({ user: authId }).sort(
      "-createdAt"
    );
    if (lastCheckIn) {
      const diffMinutes =
        (new Date().getTime() - lastCheckIn.createdAt.getTime()) / 1000 / 60;
      if (diffMinutes < checkinWaitTime) {
        logger.debug(`check-in cool down: ${checkinWaitTime} minutes`);
        throw createError(
          `You must wait at least ${checkinWaitTime} minutes between check-ins`,
          StatusCodes.BAD_REQUEST
        );
      }
    }
  }
}

async function addCheckinReward(authId: string, checkin: ICheckIn) {
  return addReward(authId, {
    refType: "Checkin",
    refId: checkin._id,
    placeId: checkin.place,
  });
}

async function processCheckinActivities(
  authId: string,
  checkin: ICheckIn,
  place: string,
  privacyType?: ActivityPrivacyTypeEnum
) {
  try {
    await checkinEarning(authId, checkin);
    const populatedPlace = await Place.findById(place);
    if (!populatedPlace) {
      throw createError(
        dynamicMessage(dStrings.notFound, "Place"),
        StatusCodes.NOT_FOUND
      );
    }
    const hasMedia = Boolean(checkin.image);
    const activity = await addCheckinActivity(
      authId,
      checkin._id,
      place,
      privacyType || ActivityPrivacyTypeEnum.PUBLIC,
      hasMedia
    );
    checkin.userActivityId = activity._id;
    await checkin.save();
    await User.updateOne({ _id: authId }, { latestPlace: place });
  } catch (e) {
    logger.error(`Something happened during checkin activities: ${e}`);
    throw e;
  }
}

async function sendNotificiationToFollowers(authId: string, checkin: ICheckIn) {
  const followers = await Follow.find({
    target: authId,
  }).lean();
  for (const follower of followers) {
    await Notification.create({
      user: follower.user,
      type: NotificationTypeEnum.FOLLOWING_CHECKIN,
      resources: [
        {
          _id: checkin._id,
          type: ResourceTypeEnum.CHECKIN,
          date: checkin.createdAt,
        },
      ],
      importance: 2,
    });
  }
}

export const createCheckinValidation: ValidationChain[] = [
  body("place").exists().isMongoId().withMessage("Invalid place id"),
  body("privacyType").optional().isIn(Object.values(ActivityPrivacyTypeEnum)),
  body("caption").optional().isString(),
  body("image").optional().isMongoId(),
  body("tags").optional().isArray(),
  body("tags.*").optional().isMongoId(),
];

export async function createCheckin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: authId, role: authRole } = req.user!;
    const { place, privacyType, caption, tags, image } = req.body;

    await enforceCheckinInterval(authId, authRole);

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

    let media;
    if (image) {
      logger.verbose("validate image");
      const upload = await Upload.findById(image);
      if (!upload) {
        throw createError(
          dynamicMessage(dStrings.notFound, "Uploaded image"),
          StatusCodes.NOT_FOUND
        );
      }
      media = await Media.create({
        type: MediaTypeEnum.image,
        user: authId,
        place,
        caption: caption,
        src: upload.src,
      });
      if (upload.user.toString() !== authId) {
        throw createError(
          strings.authorization.otherUser,
          StatusCodes.FORBIDDEN
        );
      }
      if (upload.type !== "image") {
        throw createError(strings.upload.invalidType, StatusCodes.BAD_REQUEST);
      }
    }

    const checkin = await CheckIn.create({
      user: authId,
      place: place,
      image: media?._id,
      caption: caption,
      tags: tags,
    });

    await processCheckinActivities(authId, checkin, place, privacyType);

    const reward = await addCheckinReward(authId, checkin);

    const placeObject = await Place.findById(place);
    placeObject.activities.checkinCount =
      placeObject.activities.checkinCount + 1;
    await placeObject.save();

    await sendNotificiationToFollowers(authId, checkin);

    logger.verbose("check-in successful!");
    res
      .status(StatusCodes.CREATED)
      .json({ success: true, data: checkin, reward: reward });
  } catch (err) {
    next(err);
  }
}
