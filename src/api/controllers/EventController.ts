import type { NextFunction, Request, Response } from "express";
import { body, param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import { Types } from "mongoose";

import Event from "../../models/Event.js";
import Place from "../../models/Place.js";
import { dStrings, dynamicMessage } from "../../strings.js";
import {
  createError,
  handleInputErrors,
} from "../../utilities/errorHandlers.js";
import { filterObjectByConfig } from "../../utilities/filtering.js";
import PlaceProjection, { PlaceProjectionBrief } from "../dto/place.js";

export const getEventValidation: ValidationChain[] = [param("id").isMongoId()];
export async function getEvent(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const id = new Types.ObjectId(req.params.id);

    const event = await Event.findById(id)
      .orFail(createError(dynamicMessage(dStrings.notFound, "Event")))
      .populate<{
        place: PlaceProjectionBrief;
      }>("place", PlaceProjection.brief)
      .lean();

    if (!event.place) {
      throw createError(dynamicMessage(dStrings.notFound, "Place"));
    } else {
      event.place.location.geoLocation = {
        lat: event.place.location.geoLocation.coordinates[1],
        lng: event.place.location.geoLocation.coordinates[0],
      } as any;
    }

    res.status(StatusCodes.OK).json({ success: true, data: event });
  } catch (error) {
    next(error);
  }
}

export const createEventValidation: ValidationChain[] = [
  body("name").isString().notEmpty(),
  body("description").optional().isString(),
  body("logo").optional().isString(),
  body("place").isObject(),
  body("place.id").optional().isMongoId(),
  body("place.name").optional().isString(),
  body("place.latitude").optional().isNumeric(),
  body("place.longitude").optional().isNumeric(),
  body("place.address").optional().isString(),
  body("place.city").optional().isString(),
  body("place.state").optional().isString(),
  body("place.country").optional().isString(),
  body("place.zip").optional().isString(),
];
export async function createEvent(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const { name, description, logo, place } = req.body;

    let eventPlace;
    if (place.id) {
      eventPlace = await Place.findById(place.id).orFail(
        createError(dynamicMessage(dStrings.notFound, "Place"))
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

    res.status(StatusCodes.CREATED).json({ success: true, data: eventObj });
  } catch (error) {
    next(error);
  }
}

export const getEventsValidation: ValidationChain[] = [
  query("q").optional().isString().trim().notEmpty(),
];

export async function getEvents(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    let query: {
      isActive: boolean;
      name?: Record<string, any>;
    } = { isActive: true };

    if (req.query.q) {
      query.name = { $regex: new RegExp(req.query.q.toString(), "i") };
    }

    const events = await Event.find(query)
      .populate<{
        place: PlaceProjectionBrief;
      }>("place", PlaceProjection.brief)
      .lean();

    for (const event of events) {
      if (!event.place) {
        throw createError(dynamicMessage(dStrings.notFound, "Event"));
      } else {
        if ("coordinates" in event.place.location.geoLocation) {
          event.place.location.geoLocation = {
            lat: event.place.location.geoLocation.coordinates[1],
            lng: event.place.location.geoLocation.coordinates[0],
          } as any;
        }
      }
    }

    res.status(StatusCodes.OK).json({ success: true, data: events });
  } catch (error) {
    next(error);
  }
}
