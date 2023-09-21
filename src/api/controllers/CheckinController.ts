import type { NextFunction, Request, Response } from "express";
import { body, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import CheckIn from "../../models/CheckIn";
import User from "../../models/User";
import { ActivityPrivacyTypeEnum } from "../../models/UserActivity";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { checkinEarning } from "../services/earning.service";
import { addCreateCheckinXP } from "../services/ranking.service";
import { addCheckinActivity } from "../services/user.activity.service";
import validate from "./validators";
import { publicReadUserProjectionAG } from "../dto/user/read-user-public.dto";
import { readPlaceBriefProjectionAG } from "../dto/place/read-place-brief.dto";
import { getFormattedPlaceLocationAG } from "../dto/place/place-dto";

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
    const limit = parseInt(reqLimit as string) || 50;
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
                      ...readPlaceBriefProjectionAG,
                      location: getFormattedPlaceLocationAG,
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
                user: publicReadUserProjectionAG,
                place: readPlaceBriefProjectionAG,
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
    console.log(err);
    next(err);
  }
}
