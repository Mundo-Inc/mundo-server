import type { NextFunction, Request, Response } from "express";
import { param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";

import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import validate from "./validators";
import CheckIn from "../../models/CheckIn";
import mongoose from "mongoose";
import { checkinEarning } from "../services/earning.service";
import { addCheckinActivity } from "../services/user.activity.service";
import UserActivity, {
  ActivityPrivacyTypeEnum,
} from "../../models/UserActivity";
import { addCreateCheckinXP } from "../services/ranking.service";
import User from "../../models/User";
import { getUserFeed } from "../services/feed.service";
import ActivitySeen from "../../models/ActivitySeen";
import strings from "../../strings";

export const getFeedValidation: ValidationChain[] = [
  validate.page(query("page").optional()),
  validate.limit(query("limit").optional(), 10, 50),
  validate.lng(query("lng").optional()),
  validate.lat(query("lat").optional()),
];
export async function getFeed(req: Request, res: Response, next: NextFunction) {
  try {
    handleInputErrors(req);

    const { id: authId } = req.user!;

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const { lng, lat } = req.query;

    const result = await getUserFeed(
      authId,
      page,
      limit,
      lng && lat
        ? { lng: Number(lng as string), lat: Number(lat as string) }
        : undefined
    );

    res.status(StatusCodes.OK).json({ success: true, result: result || [] });
  } catch (err) {
    next(err);
  }
}

export const activitySeenValidation: ValidationChain[] = [
  param("id").isMongoId(),
];
export async function activitySeen(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: authId } = req.user!;
    const { id } = req.params;

    const activity = await UserActivity.findById(id);
    const seen = await ActivitySeen.findOne({
      subjectId: activity.userId,
      observerId: authId,
      activityId: id,
    });
    const weight = seen ? seen.weight + 1 : 1;
    await ActivitySeen.updateOne(
      {
        subjectId: activity.userId,
        observerId: authId,
        activityId: id,
      },
      {
        seenAt: new Date(),
        weight,
      },
      { upsert: true }
    );
    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}
