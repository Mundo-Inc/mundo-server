import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import PlaceProjection from "../../../api/dto/place.js";
import Event from "../../../models/Event.js";
import Place from "../../../models/Place.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { filterObjectByConfig } from "../../../utilities/filtering.js";
import { createResponse } from "../../../utilities/response.js";
import {
  validateData,
  zGeoValidation,
  zObjectId,
} from "../../../utilities/validation.js";

const body = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  logo: z.string().url().optional(),
  place: z.object({
    id: zObjectId.optional(),
    name: z.string().optional(),
    latitude: zGeoValidation.lat.optional(),
    longitude: zGeoValidation.lng.optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    zip: z.string().optional(),
  }),
});

type Body = z.infer<typeof body>;

export const createEventValidation = validateData({
  body: body,
});

export async function createEvent(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { name, description, logo, place } = req.body as Body;

    let eventPlace;
    if (place.id) {
      eventPlace = await Place.findById(place.id).orFail(
        createError(dynamicMessage(ds.notFound, "Place")),
      );
    } else {
      const {
        name: placeName,
        latitude,
        longitude,
        address,
        city,
        state,
        country,
        zip,
      } = place;

      eventPlace = await Place.create({
        isCustom: true,
        name: placeName,
        location: {
          geoLocation: {
            type: "Point",
            coordinates: [longitude, latitude],
          },
          address,
          city,
          state,
          country,
          zip,
        },
      });
    }

    const eventPlaceObj: any = eventPlace.toObject();

    eventPlaceObj.location.geoLocation = {
      lat: eventPlaceObj.location.geoLocation.coordinates[1],
      lng: eventPlaceObj.location.geoLocation.coordinates[0],
    };

    const event = await Event.create({
      name,
      description,
      logo,
      place: eventPlace._id,
      createdBy: authUser._id,
    });

    const eventObj: any = event.toObject();

    eventObj.place = filterObjectByConfig(eventPlaceObj, PlaceProjection.brief);

    res.status(StatusCodes.CREATED).json(createResponse(eventObj));
  } catch (error) {
    next(error);
  }
}
