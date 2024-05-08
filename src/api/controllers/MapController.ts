import type { NextFunction, Request, Response } from "express";
import { query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose, { type FilterQuery } from "mongoose";

import Follow, { type IFollow } from "../../models/Follow";
import UserActivity, {
  ActivityPrivacyTypeEnum,
} from "../../models/UserActivity";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { readFormattedPlaceLocationProjection } from "../dto/place/place-dto";
import { readPlaceBriefProjection } from "../dto/place/read-place-brief.dto";
import UserProjection from "../dto/user/user";
import validate from "./validators";

const API_KEY = process.env.GOOGLE_GEO_API_KEY!;

export const getMapActivitiesValidation: ValidationChain[] = [
  validate.lat(query("northEastLat")),
  validate.lng(query("northEastLng")),
  validate.lat(query("southWestLat")),
  validate.lng(query("southWestLng")),
  query("startDate").isNumeric(),
  query("scope").isIn(["GLOBAL", "FOLLOWINGS"]),
  query("users").optional().isString(),
];

export async function getMapActivities(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const {
      northEastLat,
      northEastLng,
      southWestLat,
      southWestLng,
      startDate,
      scope,
      users,
    } = req.query;

    const northEast = {
      lat: Number(northEastLat),
      lng: Number(northEastLng),
    };
    const southWest = {
      lat: Number(southWestLat),
      lng: Number(southWestLng),
    };

    // Define the bounding box for the geo query
    const boundingBox = [
      [southWest.lng, southWest.lat], // lower left corner (longitude, latitude)
      [northEast.lng, northEast.lat], // upper right corner (longitude, latitude)
    ];

    const createdAtFrom = new Date(Number(startDate));
    if (isNaN(createdAtFrom.getTime())) {
      throw createError("Invalida Date", StatusCodes.BAD_REQUEST);
    }

    const usersArrayStr = users
      ? users
          .toString()
          .trim()
          .split(",")
          .map((u) => {
            return new mongoose.Types.ObjectId(u);
          })
      : [];

    let query;
    if (usersArrayStr.length > 0) {
      query = {
        userId: {
          $in: usersArrayStr,
        },
        geoLocation: {
          $geoWithin: {
            $box: boundingBox,
          },
        },
        privacyType: ActivityPrivacyTypeEnum.PUBLIC,
        createdAt: { $gte: createdAtFrom },
      };
    } else if (scope === "GLOBAL") {
      query = {
        geoLocation: {
          $geoWithin: {
            $box: boundingBox,
          },
        },
        createdAt: { $gte: createdAtFrom },
      };
    } else {
      const followingsObj: FilterQuery<IFollow> = await Follow.find(
        {
          user: authUser._id,
        },
        {
          target: 1,
        }
      );

      const followingsIds = [...followingsObj.map((f: IFollow) => f.target)];

      query = {
        userId: {
          $in: followingsIds,
        },
        geoLocation: {
          $geoWithin: {
            $box: boundingBox,
          },
        },
        privacyType: ActivityPrivacyTypeEnum.PUBLIC,
        createdAt: { $gte: createdAtFrom },
      };
    }

    const activities = await UserActivity.aggregate([
      {
        $match: query,
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $limit: 300,
      },
      {
        $lookup: {
          from: "places",
          localField: "placeId",
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
          from: "users",
          localField: "userId",
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
        $project: {
          _id: 1,
          createdAt: 1,
          activityType: 1,
          user: { $arrayElemAt: ["$user", 0] },
          place: { $arrayElemAt: ["$place", 0] },
        },
      },
    ]);

    res.status(StatusCodes.OK).json({
      success: true,
      data: activities,
    });
  } catch (error: any) {
    next(error);
  }
}
