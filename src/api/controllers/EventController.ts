import type { NextFunction, Request, Response } from "express";
import { body, param, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";

import Event from "../../models/Event";
import Place from "../../models/Place";
import { dStrings, dynamicMessage } from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { filterObjectByConfig } from "../../utilities/filtering";
import { readPlaceBriefProjection } from "../dto/place/read-place-brief.dto";

export const getEventValidation: ValidationChain[] = [param("id").isMongoId()];
export async function getEvent(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id } = req.params;

    const event: any = await Event.findById(id)
      .populate("place", readPlaceBriefProjection)
      .lean();

    if (!event) {
      throw createError(dynamicMessage(dStrings.notFound, "Event"));
    }

    if (!event.place) {
      throw createError(dynamicMessage(dStrings.notFound, "Place"));
    } else {
      event.place.location.geoLocation = {
        lat: event.place.location.geoLocation.coordinates[1],
        lng: event.place.location.geoLocation.coordinates[0],
      };
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

    const { id: authId } = req.user!;

    const { name, description, logo, place } = req.body;

    let eventPlace;
    if (place.id) {
      eventPlace = await Place.findById(place.id);
      if (!eventPlace) {
        throw createError(dynamicMessage(dStrings.notFound, "Place"));
      }
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

    const eventPlaceObj = eventPlace.toObject();

    eventPlaceObj.location.geoLocation = {
      lat: eventPlaceObj.location.geoLocation.coordinates[1],
      lng: eventPlaceObj.location.geoLocation.coordinates[0],
    };

    const event = await Event.create({
      name,
      description,
      logo,
      place: eventPlace._id,
      createdBy: authId,
    });

    const eventObj = event.toObject();

    eventObj.place = filterObjectByConfig(
      eventPlaceObj,
      readPlaceBriefProjection
    );

    res.status(StatusCodes.CREATED).json({ success: true, data: eventObj });
  } catch (error) {
    next(error);
  }
}

export const getEventsValidation: ValidationChain[] = [];
export async function getEvents(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const events = await Event.find({
      isActive: true,
    })
      .populate("place", readPlaceBriefProjection)
      .lean();

    for (const event of events) {
      if (!event.place) {
        throw createError(dynamicMessage(dStrings.notFound, "Place"));
      } else {
        if ("coordinates" in event.place.location.geoLocation) {
          event.place.location.geoLocation = {
            lat: event.place.location.geoLocation.coordinates[1],
            lng: event.place.location.geoLocation.coordinates[0],
          };
        }
      }
    }

    res.status(StatusCodes.OK).json({ success: true, data: events });
  } catch (error) {
    next(error);
  }
}
