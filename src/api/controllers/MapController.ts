import type { NextFunction, Request, Response } from "express";
import { query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose, { type FilterQuery } from "mongoose";

import Follow from "../../models/Follow.js";
import UserActivity, {
  ResourcePrivacyEnum,
  type IUserActivity,
} from "../../models/UserActivity.js";
import {
  createError,
  handleInputErrors,
} from "../../utilities/errorHandlers.js";
import PlaceProjection from "../dto/place.js";
import UserProjection from "../dto/user.js";
import validate from "./validators.js";

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

    let query: FilterQuery<IUserActivity> = {};
    if (usersArrayStr.length > 0) {
      // TODO: Check followers
      query = {
        userId: {
          $in: usersArrayStr,
        },
        geoLocation: {
          $geoWithin: {
            $box: boundingBox,
          },
        },
        resourcePrivacy: { $ne: ResourcePrivacyEnum.PRIVATE },
        isAccountPrivate: false,
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
        resourcePrivacy: { $ne: ResourcePrivacyEnum.PRIVATE },
        isAccountPrivate: false,
      };
    } else {
      const followingsIds = await Follow.find(
        {
          user: authUser._id,
        },
        {
          target: 1,
        }
      )
        .lean()
        .then((followings) => followings.map((f) => f.target));

      query = {
        userId: {
          $in: followingsIds,
        },
        geoLocation: {
          $geoWithin: {
            $box: boundingBox,
          },
        },
        resourcePrivacy: { $ne: ResourcePrivacyEnum.PRIVATE },
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
                ...PlaceProjection.brief,
                location: PlaceProjection.locationProjection,
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
