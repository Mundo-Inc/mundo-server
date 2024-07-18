import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import UserProjection from "@/api/dto/user.js";
import Event from "@/models/Event.js";
import Media from "@/models/Media.js";
import Place from "@/models/Place.js";
import { dStrings as ds, dynamicMessage } from "@/strings.js";
import { createError } from "@/utilities/errorHandlers.js";
import { getPaginationFromQuery } from "@/utilities/pagination.js";
import {
  validateData,
  zObjectId,
  zPaginationSpread,
} from "@/utilities/validation.js";

const query = z.object({
  ...zPaginationSpread,
  event: zObjectId.optional(),
  place: zObjectId.optional(),
});

type Query = z.infer<typeof query>;

export const getMediaValidation = validateData({
  query: query,
});

export async function getMedia(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { page, limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 20,
      maxLimit: 30,
    });

    const { event, place } = req.query as unknown as Query;

    if (!place && !event) {
      throw createError(
        "Either place or event is required",
        StatusCodes.BAD_REQUEST
      );
    }

    if (place) {
      await Place.exists({ _id: place }).orFail(
        createError(dynamicMessage(ds.notFound, "Place"), StatusCodes.NOT_FOUND)
      );
    }

    if (event) {
      await Event.exists({ _id: event }).orFail(
        createError(dynamicMessage(ds.notFound, "Event"), StatusCodes.NOT_FOUND)
      );
    }

    const medias = await Media.find({
      ...(event && { event: event }),
      ...(place && { place: place }),
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("user", UserProjection.essentials)
      .lean();

    res.status(StatusCodes.OK).json({
      success: true,
      data: medias,
      pagination: {
        totalCount: medias.length,
        page,
        limit,
      },
    });
  } catch (err) {
    next(err);
  }
}
