import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import type { PlaceProjectionBrief } from "../../../api/dto/place.js";
import PlaceProjection from "../../../api/dto/place.js";
import Event from "../../../models/event.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const params = z.object({
  id: zObjectId,
});

type Params = z.infer<typeof params>;

export const getEventValidation = validateData({
  params: params,
});

export async function getEvent(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = req.params as unknown as Params;

    const event = await Event.findById(id)
      .orFail(createError(dynamicMessage(ds.notFound, "Event")))
      .populate<{
        place: PlaceProjectionBrief;
      }>("place", PlaceProjection.brief)
      .lean();

    if (!event.place) {
      throw createError(dynamicMessage(ds.notFound, "Place"));
    } else {
      event.place.location.geoLocation = {
        lat: event.place.location.geoLocation.coordinates[1],
        lng: event.place.location.geoLocation.coordinates[0],
      } as any;
    }

    res.status(StatusCodes.OK).json(createResponse(event));
  } catch (error) {
    next(error);
  }
}
