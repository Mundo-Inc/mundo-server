import axios from "axios";
import type { NextFunction, Request, Response } from "express";
import { query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose, { type FilterQuery } from "mongoose";

import CheckIn from "../../models/CheckIn";
import Follow, { type IFollow } from "../../models/Follow";
import Place from "../../models/Place";
import Review from "../../models/Review";
import UserActivity, {
  ActivityPrivacyTypeEnum,
} from "../../models/UserActivity";
import strings from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { readPlaceBriefProjection } from "../dto/place/read-place-brief.dto";
import { publicReadUserEssentialProjection } from "../dto/user/read-user-public.dto";
import validate from "./validators";

const API_KEY = process.env.GOOGLE_GEO_API_KEY!;

export const getGeoLocationValidation: ValidationChain[] = [
  validate.lng(query("lng").optional()),
  validate.lat(query("lat").optional()),
  query("address").optional().isString(),
];
export async function getGeoLocation(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { lng, lat, address } = req.query;

    let url;
    if (address) {
      url = `https://maps.googleapis.com/maps/api/geocode/json?address=${address}&key=${API_KEY}`;
    } else if (lat && lng) {
      url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${API_KEY}`;
    } else {
      throw createError(
        strings.validations.invalidType,
        StatusCodes.BAD_REQUEST
      );
    }

    const response = await axios(url);
    const data = await response.data;

    if (!data.results[0]) {
      throw createError(strings.data.noResult, StatusCodes.NOT_FOUND);
    }

    const responseData = data.results[0];

    let theAddress = [];
    let postal_code, state, city, country;
    let addressComplete = false;

    for (let i = 0; i < responseData.address_components.length; i++) {
      const component = responseData.address_components[i];
      if (component.types.includes("street_number")) {
        theAddress.push(component.short_name);
      } else if (component.types.includes("route")) {
        addressComplete = true;
        theAddress.push(component.short_name);
      } else if (component.types.includes("administrative_area_level_4")) {
        if (!addressComplete) {
          theAddress.push(component.short_name);
        }
      } else if (component.types.includes("administrative_area_level_3")) {
        if (!addressComplete) {
          theAddress.push(component.short_name);
        }
      } else if (component.types.includes("administrative_area_level_2")) {
        if (!addressComplete) {
          theAddress.push(component.short_name);
        }
      } else if (component.types.includes("postal_code")) {
        postal_code = component.long_name;
      } else if (component.types.includes("locality")) {
        city = component.long_name;
      } else if (component.types.includes("country")) {
        country = component.long_name;
      } else if (component.types.includes("administrative_area_level_1")) {
        state = component.long_name;
      }
    }

    if (!city) {
      city = state;
    }

    res.status(StatusCodes.OK).json({
      fullAddress: responseData.formatted_address,
      address: theAddress.join(" "),
      postal_code: postal_code,
      country: country,
      state,
      city,
      lat: responseData.geometry.location.lat,
      lng: responseData.geometry.location.lng,
    });
  } catch (err) {
    next(err);
  }
}

export const getMapActivitiesValidation: ValidationChain[] = [
  validate.lat(query("northEastLat")),
  validate.lng(query("northEastLng")),
  validate.lat(query("southWestLat")),
  validate.lng(query("southWestLng")),
  query("startDate").isString(),
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

    const { id: authId } = req.user!;

    const followingsObj: FilterQuery<IFollow> = await Follow.find(
      {
        user: authId,
      },
      {
        target: 1,
      }
    );

    const followingsIdsStr = [
      ...followingsObj.map((f: IFollow) => f.target.toString()),
    ];

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

    let targetUsers = followingsIdsStr;

    if (users) {
      const usersArrayStr = users.toString().trim().split(",");
      targetUsers = followingsIdsStr.filter((id) => usersArrayStr.includes(id));
    }

    // Define the bounding box for the geo query
    const boundingBox = [
      [southWest.lng, southWest.lat], // lower left corner (longitude, latitude)
      [northEast.lng, northEast.lat], // upper right corner (longitude, latitude)
    ];

    let createdAtFrom: Date;
    if (typeof startDate === "string") {
      createdAtFrom = new Date(startDate);
    } else {
      throw createError("Invalid startDate format");
    }
    let query;
    if (scope === "GLOBAL") {
      query = {
        geoLocation: {
          $geoWithin: {
            $box: boundingBox,
          },
        },
        createdAt: { $gte: createdAtFrom },
      };
    } else {
      query = {
        userId: {
          $in: targetUsers,
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
              $project: readPlaceBriefProjection,
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
              $project: publicReadUserEssentialProjection,
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
    res.json({
      success: true,
      data: activities,
    });
  } catch (error: any) {
    next(error);
  }
}

export const getGeoActivitiesValidation: ValidationChain[] = [
  validate.lat(query("northEastLat")),
  validate.lng(query("northEastLng")),
  validate.lat(query("southWestLat")),
  validate.lng(query("southWestLng")),
];

export async function getGeoActivities(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: authId } = req.user!;

    const followingsObj: FilterQuery<IFollow> = await Follow.find(
      {
        user: authId,
      },
      {
        target: 1,
      }
    );
    const followingsIdsStr = [
      ...followingsObj.map((f: IFollow) => f.target),
      new mongoose.Types.ObjectId(authId),
    ];

    const { northEastLat, northEastLng, southWestLat, southWestLng } =
      req.query;
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

    // Query the database for places within the bounding box
    const places = await Place.find(
      {
        "location.geoLocation": {
          $geoWithin: {
            $box: boundingBox,
          },
        },
        $or: [
          { "activities.reviewCount": { $gt: 0 } },
          { "activities.checkinCount": { $gt: 0 } },
        ],
      },
      "_id location.geoLocation.coordinates activities"
    ).lean();

    // Fetch associated check-ins and reviews for each place
    const activities = await Promise.all(
      places.map(async (place) => {
        const checkins = await CheckIn.find({ place: place._id })
          .populate("user", "profileImage name isPrivate")
          .select("user")
          .limit(10) // Limit the number of checkins
          .lean();

        const reviews = await Review.find({
          place: place._id,
          source: { $nin: ["yelp", "google"] },
        })
          .populate("writer", "profileImage name isPrivate")
          .select("writer")
          .limit(10) // Limit the number of reviews
          .lean();

        let usersData: any[] = [];
        checkins.forEach((checkin) => {
          const found = usersData.find(
            (uData) => uData._id === checkin.user._id.toString()
          );
          if (!found) {
            if (
              !checkin.user.isPrivate ||
              followingsIdsStr.includes(checkin.user._id.toString())
            ) {
              usersData.push({
                _id: checkin.user._id.toString(),
                name: checkin.user.name,
                profileImage: checkin.user.profileImage,
                checkinsCount: 1,
                reviewsCount: 0,
              });
            }
          } else {
            found.checkinsCount++;
          }
        });

        reviews.forEach((review) => {
          const found = usersData.find(
            (uData) => uData._id === review.writer._id.toString()
          );
          if (!found) {
            if (
              !review.writer.isPrivate ||
              followingsIdsStr.includes(review.writer._id.toString())
            ) {
              usersData.push({
                _id: review.writer._id.toString(),
                name: review.writer.name,
                profileImage: review.writer.profileImage,
                checkinsCount: 0,
                reviewsCount: 1,
              });
            }
          } else {
            found.reviewsCount++;
          }
        });

        usersData = usersData.map((user) => ({
          name: user.name,
          profileImage: user.profileImage,
          checkinsCount: user.checkinsCount,
          reviewsCount: user.reviewsCount,
        }));

        // Construct the activity object in the desired format
        return {
          placeId: place._id,
          coordinates: place.location.geoLocation.coordinates,
          activities: {
            ...place.activities,
            data: usersData,
          },
        };
      })
    );

    res.json({
      success: true,
      data: { activities: activities },
    });
  } catch (error: any) {
    next(error);
  }
}
