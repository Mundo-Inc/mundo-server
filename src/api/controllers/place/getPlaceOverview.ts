import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import MediaProjection from "../../../api/dto/media.js";
import Place from "../../../models/Place.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const params = z.object({
  placeId: zObjectId,
});

type Params = z.infer<typeof params>;

export const getPlaceOverviewValidation = validateData({
  params: params,
});

export async function getPlaceOverview(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { placeId } = req.params as unknown as Params;

    const response = await Place.aggregate([
      {
        $match: {
          _id: placeId,
        },
      },
      {
        $lookup: {
          from: "media",
          localField: "_id",
          foreignField: "place",
          as: "media",
          pipeline: [
            {
              // Prioritizing videos over images
              $sort: {
                type: -1,
              },
            },
            {
              $limit: 5,
            },
            {
              $project: MediaProjection.brief,
            },
          ],
        },
      },
      {
        $project: {
          name: 1,
          amenity: 1,
          otherNames: 1,
          thumbnail: 1,
          media: 1,
          scores: 1,
          activities: 1,
          priceRange: 1,
          description: 1,
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
          phone: 1,
          website: 1,
          categories: 1,
        },
      },
    ]).then((result) => result[0]);

    if (!response) {
      throw createError(
        dynamicMessage(ds.notFound, "Place"),
        StatusCodes.NOT_FOUND,
      );
    }

    res.status(StatusCodes.OK).json(createResponse(response));
  } catch (err) {
    next(err);
  }
}
