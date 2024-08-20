import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import Place, { type IPlace } from "../../../models/place.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import { areStrictlySimilar } from "../../../utilities/stringHelper.js";
import { validateData, zGeoValidation } from "../../../utilities/validation.js";
import { getDetailedPlace } from "./helpers.js";

const query = z.object({
  lat: zGeoValidation.string.lat,
  lng: zGeoValidation.string.lng,
  title: z
    .string()
    .min(1)
    .transform((value) => decodeURIComponent(value)),
});

type Query = z.infer<typeof query>;

export const getPlaceByContextValidation = validateData({
  query: query,
});

export async function getPlaceByContext(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { lat, lng, title } = req.query as unknown as Query;

    // get the place or if it doesn't exist create it

    const nearbyPlaces = await Place.find({
      "location.geoLocation": {
        $nearSphere: {
          $geometry: {
            type: "Point",
            coordinates: [lng, lat],
          },
          $maxDistance: 30, // in meters
        },
      },
    });

    let matchedPlace: IPlace | null = null;
    let existing: boolean = false;

    for (const place of nearbyPlaces) {
      if (areStrictlySimilar(title, place.name)) {
        matchedPlace = place;
        existing = true;
        break;
      }
    }

    if (!matchedPlace) {
      matchedPlace = await Place.create({
        name: title,
        location: {
          geoLocation: {
            type: "Point",
            coordinates: [lng, lat],
          },
        },
      });
    }

    // combine it with detailed data

    const result = await getDetailedPlace(matchedPlace._id);

    if (!existing && !result.thirdParty.google?.id) {
      // If the place is new and doesn't exist on Google, delete it
      await Place.deleteOne({ _id: matchedPlace._id });
      throw createError("Place doesn't exist", StatusCodes.NOT_FOUND);
    } else {
      res.status(StatusCodes.OK).json(createResponse(result));
    }
  } catch (err) {
    next(err);
  }
}
