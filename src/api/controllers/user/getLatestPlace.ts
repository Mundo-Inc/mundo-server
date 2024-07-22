import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import Place from "../../../models/Place.js";
import type { IUser } from "../../../models/User.js";
import User from "../../../models/User.js";
import strings, { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const getLatestPlaceParams = z.object({
  id: zObjectId,
});

type GetLatestPlaceParams = z.infer<typeof getLatestPlaceParams>;

export const getLatestPlaceValidation = validateData({
  params: getLatestPlaceParams,
});

export async function getLatestPlace(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { id } = req.params as unknown as GetLatestPlaceParams;

    if (!authUser._id.equals(id) && authUser.role !== "admin") {
      throw createError(
        strings.authorization.accessDenied,
        StatusCodes.FORBIDDEN,
      );
    }

    const user = await User.findById(id)
      .select<Pick<IUser, "latestPlace">>("latestPlace")
      .orFail(
        createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND),
      )
      .lean();

    if (!user.latestPlace) {
      throw createError(strings.user.noLatestPlace, StatusCodes.NOT_FOUND);
    }

    let latestPlace: any = await Place.findById(user.latestPlace, {
      _id: true,
      name: true,
      location: true,
    }).lean();

    if (latestPlace) {
      latestPlace.location.geoLocation = {
        lat: latestPlace.location.geoLocation.coordinates[1],
        lng: latestPlace.location.geoLocation.coordinates[0],
      };
    } else {
      latestPlace = null;
    }

    res.status(StatusCodes.OK).json(createResponse(latestPlace));
  } catch (err) {
    next(err);
  }
}
