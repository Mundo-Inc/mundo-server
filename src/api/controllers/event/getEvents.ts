import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import type { FilterQuery } from "mongoose";
import { z } from "zod";

import type { PlaceProjectionBrief } from "../../../api/dto/place.js";
import PlaceProjection from "../../../api/dto/place.js";
import type { IEvent } from "../../../models/Event.js";
import Event from "../../../models/Event.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData } from "../../../utilities/validation.js";

const query = z.object({
  q: z
    .string()
    .min(1)
    .trim()
    .transform((value) => decodeURIComponent(value))
    .optional(),
});

type Query = z.infer<typeof query>;

export const getEventsValidation = validateData({
  query: query,
});

export async function getEvents(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { q } = req.query as Query;

    let query: FilterQuery<IEvent> = { isActive: true };

    if (q) {
      query.name = { $regex: new RegExp(q.toString(), "i") };
    }

    const events = await Event.find(query)
      .populate<{
        place: PlaceProjectionBrief;
      }>("place", PlaceProjection.brief)
      .lean();

    for (const event of events) {
      if (!event.place) {
        throw createError(dynamicMessage(ds.notFound, "Event"));
      } else {
        if ("coordinates" in event.place.location.geoLocation) {
          event.place.location.geoLocation = {
            lat: event.place.location.geoLocation.coordinates[1],
            lng: event.place.location.geoLocation.coordinates[0],
          } as any;
        }
      }
    }

    res.status(StatusCodes.OK).json(createResponse(events));
  } catch (error) {
    next(error);
  }
}
