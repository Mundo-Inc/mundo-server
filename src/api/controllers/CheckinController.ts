import type { NextFunction, Request, Response } from "express";
import { body, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import CheckIn, { ICheckIn } from "../../models/CheckIn";
import Place from "../../models/Place";
import User from "../../models/User";
import { ActivityPrivacyTypeEnum } from "../../models/UserActivity";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { readFormattedPlaceLocationProjection } from "../dto/place/place-dto";
import { readPlaceBriefProjection } from "../dto/place/read-place-brief.dto";
import { publicReadUserProjection } from "../dto/user/read-user-public.dto";
import { checkinEarning } from "../services/earning.service";
import logger from "../services/logger";
import { addReward } from "../services/reward/reward.service";
import { addCheckinActivity } from "../services/user.activity.service";
import validate from "./validators";
import Follow from "../../models/Follow";
import Notification, {
  NotificationType,
  ResourceTypes,
} from "../../models/Notification";

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
      // TODO: check to see if user checkins are public
      matchPipeline.push({
        $match: { user: new mongoose.Types.ObjectId(user as string) },
      });
    } else {
      matchPipeline.push({
        $match: { user: new mongoose.Types.ObjectId(userId) },
      });
    }
    if (place) {
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
                    $lookup: {
                      from: "achievements",
                      localField: "progress.achievements",
                      foreignField: "_id",
                      as: "progress.achievements",
                    },
                  },
                  {
                    $project: publicReadUserProjection,
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

export const createCheckinValidation: ValidationChain[] = [
  body("place").exists().isMongoId().withMessage("Invalid place id"),
  body("privacyType").optional().isIn(Object.values(ActivityPrivacyTypeEnum)),
];

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

async function createNewCheckin(authId: string, place: string) {
  return CheckIn.create({ user: authId, place: place });
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
      throw new Error("Place is missing");
    }

    const activity = await addCheckinActivity(
      authId,
      checkin._id,
      place,
      privacyType || ActivityPrivacyTypeEnum.PUBLIC
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
      user: follower.userId,
      type: NotificationType.FOLLOWING_CHECKIN,
      resources: [
        {
          _id: checkin._id,
          type: ResourceTypes.CHECKIN,
          date: checkin.createdAt,
        },
      ],
      importance: 2,
    });
  }
}

export async function createCheckin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: authId, role: authRole } = req.user!;
    const { place, privacyType } = req.body;

    await enforceCheckinInterval(authId, authRole);

    logger.verbose("creating a new checkin");
    const checkin = await createNewCheckin(authId, place);

    logger.verbose("processing check-in post activities");
    await processCheckinActivities(authId, checkin, place, privacyType);

    logger.verbose("adding check-in rewards");
    const reward = await addCheckinReward(authId, checkin);

    logger.verbose("adding checkin count to the place");
    const placeObject = await Place.findById(place);
    placeObject.activities.checkinCount =
      placeObject.activities.checkinCount + 1;
    await placeObject.save();

    logger.verbose("Sending notification to followers");
    await sendNotificiationToFollowers(authId, checkin);

    logger.verbose("check-in successful!");
    res
      .status(StatusCodes.OK)
      .json({ success: true, data: checkin, reward: reward });
  } catch (err) {
    next(err);
  }
}
