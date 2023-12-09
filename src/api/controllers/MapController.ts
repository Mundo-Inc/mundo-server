import axios from "axios";
import type { NextFunction, Request, Response } from "express";
import { query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";

import strings from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import validate from "./validators";
import logger from "../services/logger";
import Review, { IReview } from "../../models/Review";
import Comment from "../../models/Comment";
import Place, { IPlace } from "../../models/Place";
import CheckIn from "../../models/CheckIn";

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
      throw createError(strings.validations.invalidType, 400);
    }

    const response = await axios(url);
    const data = await response.data;

    if (!data.results[0]) {
      throw createError(strings.data.noResult, 404);
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

export const getGeoActivitiesValidation: ValidationChain[] = [
  query("zoom").optional().isNumeric().withMessage("Invalid zoom"),
  query("northEastLat")
    .isNumeric()
    .withMessage("Invalid northEastLat")
    .bail() // proceed to next validator only if the previous one passes
    .custom((value) => value >= -90 && value <= 90)
    .withMessage("northEastLat should be between -90 and 90"),

  query("northEastLng")
    .isNumeric()
    .withMessage("Invalid northEastLng")
    .bail()
    .custom((value) => value >= -180 && value <= 180)
    .withMessage("northEastLng should be between -180 and 180"),

  query("southWestLat")
    .isNumeric()
    .withMessage("Invalid southWestLat")
    .bail()
    .custom((value) => value >= -90 && value <= 90)
    .withMessage("southWestLat should be between -90 and 90"),

  query("southWestLng")
    .isNumeric()
    .withMessage("Invalid southWestLng")
    .bail()
    .custom((value) => value >= -180 && value <= 180)
    .withMessage("southWestLng should be between -180 and 180"),
];

export async function getGeoActivities(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const { northEastLat, northEastLng, southWestLat, southWestLng, zoom } =
      req.query;
    const northEast = {
      lat: Number(northEastLat),
      lng: Number(northEastLng),
    };
    const southWest = {
      lat: Number(southWestLat),
      lng: Number(southWestLng),
    };
    const zoomLevel = Number(zoom);

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
          .populate("user", "profileImage name")
          .select("user")
          .limit(10); // Limit the number of checkins

        const reviews = await Review.find({
          place: place._id,
          source: { $nin: ["yelp", "google"] },
        })
          .populate("writer", "profileImage name")
          .select("writer")
          .limit(10); // Limit the number of reviews

        // Transform checkins and reviews to the desired format
        const transformedCheckins = checkins.map((checkin) => ({
          name: checkin.user.name,
          profileImage: checkin.user.profileImage,
        }));

        const transformedReviews = reviews.map((review) => ({
          name: review.writer.name,
          profileImage: review.writer.profileImage,
        }));

        // Construct the activity object in the desired format
        return {
          _id: place._id,
          coordinates: place.location.geoLocation.coordinates,
          activities: {
            ...place.activities,
            checkins: transformedCheckins,
            reviews: transformedReviews,
          },
        };
      })
    );

    res.json({
      success: true,
      data: { activities: activities },
    });
  } catch (error) {
    logger.error("Error while getting map activities", { error });
    next(error);
  }
}
