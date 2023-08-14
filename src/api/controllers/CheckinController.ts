import type { NextFunction, Request, Response } from "express";
import { query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";

import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import validate from "./validators";
import CheckIn from "../../models/CheckIn";
import mongoose from "mongoose";
import { checkinEarning } from "../services/earning.service";
import { addCheckinActivity } from "../services/user.activity.service";
import { ActivityPrivacyTypeEnum } from "../../models/UserActivity";
import { addCreateCheckinXP } from "../services/ranking.service";
import User from "../../models/User";

const checkinWaitTime = 5; // minutes

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

    const { user, place, page: reqPage, limit: reqLimit, count } = req.query;
    const page = parseInt(reqPage as string) || 1;
    const limit = parseInt(reqLimit as string) || 20;
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
                thumbnail: 1,
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
          user: {
            _id: 1,
            name: 1,
            username: 1,
            profileImage: 1,
          },
          place: {
            _id: 1,
            name: 1,
            location: 1,
            thumbnail: 1,
          },
        },
      },
    ]);

    let totalCount: number | null = null;
    if (count === "true") {
      const total = await CheckIn.aggregate([
        ...matchPipeline,
        {
          $count: "total",
        },
      ]);
      totalCount = total[0]?.total || 0;
    }

    const resData: {
      data: any;
      total?: number;
    } = {
      data: checkins,
    };

    if (totalCount !== null) {
      resData["total"] = totalCount;
    }

    res.status(StatusCodes.OK).json({ success: true, ...resData });
  } catch (err) {
    next(err);
  }
}

export const createCheckinValidation: ValidationChain[] = [
  query("place").exists().isMongoId().withMessage("Invalid place id"),
  query("privacyType").optional().isIn(Object.values(ActivityPrivacyTypeEnum)),
];
export async function createCheckin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: authId, role: authrole } = req.user!;
    const { place, privacyType } = req.body;

    if (authrole !== "admin") {
      // check for last checkin
      const lastCheckIn = await CheckIn.findOne({ user: authId }).sort(
        "-createdAt"
      );
      if (lastCheckIn) {
        const diffMinutes: number =
          (new Date().getTime() - lastCheckIn.createdAt.getTime()) / 1000 / 60;
        if (diffMinutes < checkinWaitTime) {
          throw createError(
            `You must wait at least ${checkinWaitTime} minutes between check-ins`,
            StatusCodes.BAD_REQUEST
          );
        }
      }
    }

    const checkin = await CheckIn.create({
      user: authId,
      place: place,
    });
    try {
      await checkinEarning(authId, checkin);
      const _act = await addCheckinActivity(
        authId,
        checkin._id,
        place,
        privacyType || ActivityPrivacyTypeEnum.PUBLIC
      );
      await addCreateCheckinXP(authId);
      checkin.userActivityId = _act._id;
      await checkin.save();
      User.updateOne({ _id: authId }, { latestPlace: place });
    } catch (e) {
      console.log(`Something happened during checkin: ${e}`);
    }
    res.status(StatusCodes.OK).json({ success: true, data: checkin });
  } catch (err) {
    next(err);
  }
}
