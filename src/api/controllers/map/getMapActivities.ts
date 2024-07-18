import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import type { FilterQuery } from "mongoose";
import { Types } from "mongoose";
import { z } from "zod";

import PlaceProjection from "@/api/dto/place.js";
import UserProjection from "@/api/dto/user.js";
import Follow from "@/models/Follow.js";
import type { IUserActivity } from "@/models/UserActivity.js";
import UserActivity, { ResourcePrivacyEnum } from "@/models/UserActivity.js";
import { createError } from "@/utilities/errorHandlers.js";
import {
  validateData,
  zGeoValidation,
  zStringInt,
} from "@/utilities/validation.js";

const query = z.object({
  northEastLat: zGeoValidation.string.lat,
  northEastLng: zGeoValidation.string.lng,
  southWestLat: zGeoValidation.string.lat,
  southWestLng: zGeoValidation.string.lng,
  startDate: zStringInt.transform((value) => new Date(value)),
  scope: z.enum(["GLOBAL", "FOLLOWINGS"]),
  users: z
    .string()
    .transform((value) => Array.from(new Set(value.trim().split(","))))
    .refine((value) => value.every((id) => id.match(/^[0-9a-fA-F]{24}$/)))
    .transform((value) => value.map((id) => new Types.ObjectId(id)))
    .optional(),
});

type Query = z.infer<typeof query>;

export const getMapActivitiesValidation = validateData({
  query: query,
});

export async function getMapActivities(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = req.user!;

    const {
      northEastLat,
      northEastLng,
      southWestLat,
      southWestLng,
      startDate,
      scope,
      users,
    } = req.query as unknown as Query;

    // Define the bounding box for the geo query
    const boundingBox = [
      [southWestLng, southWestLat], // lower left corner (longitude, latitude)
      [northEastLng, northEastLat], // upper right corner (longitude, latitude)
    ];

    if (isNaN(startDate.getTime())) {
      throw createError("Invalida Date", StatusCodes.BAD_REQUEST);
    }

    let query: FilterQuery<IUserActivity> = {};
    if (users && users.length > 0) {
      // TODO: Check followers
      query = {
        userId: {
          $in: users,
        },
        geoLocation: {
          $geoWithin: {
            $box: boundingBox,
          },
        },
        resourcePrivacy: { $ne: ResourcePrivacyEnum.Private },
        isAccountPrivate: false,
        createdAt: { $gte: startDate },
      };
    } else if (scope === "GLOBAL") {
      query = {
        geoLocation: {
          $geoWithin: {
            $box: boundingBox,
          },
        },
        createdAt: { $gte: startDate },
        resourcePrivacy: { $ne: ResourcePrivacyEnum.Private },
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
        resourcePrivacy: { $ne: ResourcePrivacyEnum.Private },
        createdAt: { $gte: startDate },
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
