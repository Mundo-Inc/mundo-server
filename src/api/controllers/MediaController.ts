import type { NextFunction, Request, Response } from "express";
import { query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import Event from "../../models/Event.js";
import Media from "../../models/Media.js";
import Place from "../../models/Place.js";
import { dStrings, dynamicMessage } from "../../strings.js";
import {
  createError,
  handleInputErrors,
} from "../../utilities/errorHandlers.js";
import { getPaginationFromQuery } from "../../utilities/pagination.js";
import UserProjection from "../dto/user.js";
import validate from "./validators.js";

export const getMediaValidation: ValidationChain[] = [
  validate.page(query("page").optional()),
  validate.limit(query("limit").optional(), 5, 30),
  query("event")
    .if((_, { req }) => !req.query?.place)
    .isMongoId()
    .withMessage("Invalid event id"),
  query("place")
    .if((_, { req }) => !req.query?.event)
    .isMongoId()
    .withMessage("Invalid place id"),
];
export async function getMedia(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { page, limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 20,
      maxLimit: 30,
    });

    const event = req.query.event
      ? new mongoose.Types.ObjectId(req.query.event as string)
      : undefined;
    const place = req.query.place
      ? new mongoose.Types.ObjectId(req.query.place as string)
      : undefined;

    if (place) {
      await Place.exists({ _id: place }).orFail(
        createError(
          dynamicMessage(dStrings.notFound, "Place"),
          StatusCodes.NOT_FOUND
        )
      );
    }

    if (event) {
      await Event.exists({ _id: event }).orFail(
        createError(
          dynamicMessage(dStrings.notFound, "Event"),
          StatusCodes.NOT_FOUND
        )
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

    res.status(StatusCodes.OK).json({ success: true, data: medias });
  } catch (err) {
    next(err);
  }
}
