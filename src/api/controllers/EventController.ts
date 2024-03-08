import type { NextFunction, Request, Response } from "express";
import { body, param, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";

import Event from "../../models/Event";
import { dStrings, dynamicMessage } from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { readPlaceBriefProjection } from "../dto/place/read-place-brief.dto";
import Place from "../../models/Place";

export const getEventValidation: ValidationChain[] = [param("id").isMongoId()];
export async function getEvent(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id } = req.params;

    const event = await Event.findById(id)
      .populate("place", readPlaceBriefProjection)
      .lean();

    if (!event) {
      throw createError(dynamicMessage(dStrings.notFound, "Event"));
    }

    res.status(StatusCodes.CREATED).json({ success: true, data: event });
  } catch (error) {
    next(error);
  }
}

export const createEventValidation: ValidationChain[] = [
  body("name").isString().notEmpty(),
  body("description").optional().isString(),
  body("logo").optional().isString(),
  body("place").custom((value) => {
    if (typeof value === "string") {
      if (!value.match(/^[0-9a-fA-F]{24}$/)) {
        throw new Error("Invalid place id");
      }
    } else if (typeof value === "object") {
      if ("name" in value && "latitude" in value && "longitude" in value) {
        return true;
      } else {
        throw new Error("Invalid place object");
      }
    } else {
      throw new Error("Invalid place");
    }
  }),
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

    let placeId: string;
    if (typeof place === "string") {
      const placeExists = await Event.exists({ _id: place });
      if (!placeExists) {
        throw createError(dynamicMessage(dStrings.notFound, "Place"));
      }
      placeId = place;
    } else {
      const { name: placeName, latitude, longitude } = place;
      const newPlace = await Place.create({
        isCustom: true,
        name: placeName,
        location: {
          geoLocation: {
            type: "Point",
            coordinates: [longitude, latitude],
          },
        },
      });
      placeId = newPlace._id;
    }

    const event = await Event.create({
      name,
      description,
      logo,
      place: placeId,
      createdBy: authId,
    });

    res.status(StatusCodes.CREATED).json({ success: true, data: event });
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

    const events = await Event.find()
      .populate("place", readPlaceBriefProjection)
      .lean();

    res.status(StatusCodes.CREATED).json({ success: true, data: events });
  } catch (error) {
    next(error);
  }
}
