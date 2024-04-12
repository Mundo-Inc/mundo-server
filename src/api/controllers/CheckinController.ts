import type { NextFunction, Request, Response } from "express";
import { body, param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import CheckIn, { type ICheckIn } from "../../models/CheckIn";
import Event, { type IEvent } from "../../models/Event";
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
  query("event").optional().isMongoId().withMessage("Invalid event id"),
  validate.page(query("page").optional(), 50),
  validate.limit(query("limit").optional(), 1, 500),
  query("count").optional().isBoolean().withMessage("Invalid count"),
];
/**
 * @query user    string      |     to get checkins of a user
 * @query place   string      |     to get checkins of a place
 * @query event   string      |     to get checkins of an event
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

    const { id: authId } = req.user!;

    const { user, place, event, page: reqPage, limit: reqLimit } = req.query;
    const page = parseInt(reqPage as string) || 1;
    const limit = parseInt(reqLimit as string) || 500;
    const skip = (page - 1) * limit;
    const matchPipeline: any[] = [];
    if (user) {
      //PRIVACY
      const userObject = (await User.findById(user)) as IUser;
      if (userObject) {
        const isFollowed = await Follow.countDocuments({
          user: authId,
          target: userObject._id,
        });
        if (!isFollowed && userObject.isPrivate) {
          throw createError(
            strings.authorization.accessDenied,
            StatusCodes.UNAUTHORIZED
          );
        }
      }
      matchPipeline.push({
        $match: { user: new mongoose.Types.ObjectId(user as string) },
      });
    }
    if (place) {
      // TODO: Add privacy check here
      matchPipeline.push({
        $match: { place: new mongoose.Types.ObjectId(place as string) },
      });
    }
    if (event) {
      matchPipeline.push({
        $match: { event: new mongoose.Types.ObjectId(event as string) },
      });
    }

    if (user && user !== authId) {
      matchPipeline.push({
        $match: {
          privacyType: ActivityPrivacyTypeEnum.PUBLIC,
        },
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
                as: "tags",
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
                privacyType: 1,
                tags: 1,
              },
            },
          ],
        },
      },
    ]);

    if (!user || user === authId) {
      // anonymize user data
      checkins[0].checkins = checkins[0].checkins.map((checkin: any) => {
        if (
          checkin.privacyType === ActivityPrivacyTypeEnum.PRIVATE &&
          checkin.user._id.toString() !== authId
        ) {
          checkin._id = Math.random()
            .toString(16)
            .substring(2, 10)
            .padEnd(24, "0");
          checkin.user._id = Math.random()
            .toString(16)
            .substring(2, 10)
            .padEnd(24, "0");
          checkin.user.name = "Anonymous";
          checkin.user.username = "Anonymous";
          checkin.user.profileImage = null;
          checkin.user.progress = {
            xp: Math.round(checkin.user.progress?.xp / 100) * 100,
            level: Math.round(checkin.user.progress?.level / 10) * 10,
          };
        }
        return checkin;
      });
    }

    res.status(StatusCodes.OK).json({
      success: true,
      data: checkins[0].checkins,
      pagination: {
        totalCount: checkins[0].total[0]?.total || 0,
        page: page,
        limit: limit,
      },
    });
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
  body("place")
    .custom((value, { req }) => {
      if (value && req.body.event) {
        throw createError(
          "You can't check-in to both place and event at the same time",
          StatusCodes.BAD_REQUEST
        );
      }
      return true;
    })
    .if((_, { req }) => !req.body.event)
    .isMongoId()
    .withMessage("Invalid place id"),
  body("event")
    .if((_, { req }) => !req.body.place)
    .isMongoId()
    .withMessage("Invalid event id"),
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
    const { place, event, privacyType, caption, tags, image } = req.body;

    let placeId;
    if (place) {
      const placeExists = await Place.exists({ _id: place });
      if (!placeExists) {
        throw createError(
          dynamicMessage(dStrings.notFound, "Place"),
          StatusCodes.NOT_FOUND
        );
      }
      placeId = place;
    } else if (event) {
      const theEvent: IEvent | null = await Event.findById(event).lean();
      if (!theEvent) {
        throw createError(
          dynamicMessage(dStrings.notFound, "Event"),
          StatusCodes.NOT_FOUND
        );
      }
      placeId = theEvent.place;
      logger.verbose("Check-in to event");
    }

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
      if (upload.user.toString() !== authId) {
        throw createError(
          strings.authorization.otherUser,
          StatusCodes.FORBIDDEN
        );
      }
      if (upload.type !== "image") {
        throw createError(strings.upload.invalidType, StatusCodes.BAD_REQUEST);
      }

      const mediaBody: any = {
        type: MediaTypeEnum.image,
        user: authId,
        place: placeId,
        caption: caption,
        src: upload.src,
      };

      if (event) {
        mediaBody.event = event;
      }

      media = await Media.create(mediaBody);
    }

    const checkinBody: any = {
      user: authId,
      place: placeId,
      caption: caption,
      tags: tags,
      privacyType: privacyType || ActivityPrivacyTypeEnum.PUBLIC,
    };

    if (media) checkinBody.image = media._id;
    if (event) checkinBody.event = event;

    const checkin = await CheckIn.create(checkinBody);

    await processCheckinActivities(authId, checkin, placeId, privacyType);

    const reward = await addCheckinReward(authId, checkin);

    const placeObject = await Place.findById(placeId);
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

export const deleteCheckinValidation: ValidationChain[] = [
  param("id").isMongoId().withMessage("Invalid checkin id"),
];
export async function deleteCheckin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: authId, role: authRole } = req.user!;

    const { id } = req.params;

    const checkin = await CheckIn.findById(id);

    if (!checkin) {
      throw createError(
        dynamicMessage(dStrings.notFound, "Check-in"),
        StatusCodes.NOT_FOUND
      );
    }

    if (checkin.user.toString() !== authId && authRole !== "admin") {
      throw createError(strings.authorization.otherUser, StatusCodes.FORBIDDEN);
    }

    await checkin.deleteOne();

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}
