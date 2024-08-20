import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import type { Types } from "mongoose";
import { z } from "zod";

import logger from "../../../api/services/logger/index.js";
import { ResourceTypeEnum } from "../../../models/_enum/ResourceTypeEnum.js";
import CheckIn from "../../../models/CheckIn.js";
import Comment from "../../../models/Comment.js";
import type { FlagTargetType } from "../../../models/Flag.js";
import Flag, { FlagTypeEnum } from "../../../models/Flag.js";
import Homemade from "../../../models/Homemade.js";
import Review from "../../../models/Review.js";
import UserActivity from "../../../models/UserActivity.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";
import { sendSlackMessage } from "../SlackController.js";

const body = z.object({
  activity: zObjectId.optional(),
  review: zObjectId.optional(),
  comment: zObjectId.optional(),
  homemade: zObjectId.optional(),
  checkIn: zObjectId.optional(),

  flagType: z
    .string()
    .toUpperCase()
    .refine((value) =>
      Object.values(FlagTypeEnum).includes(value as FlagTypeEnum),
    )
    .transform((value) => value as FlagTypeEnum),
  note: z.string().optional(),
});

type Body = z.infer<typeof body>;

export const createFlagValidation = validateData({
  body: body,
});

export async function createFlag(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { activity, review, comment, homemade, checkIn, flagType, note } =
      req.body as Body;

    let target: Types.ObjectId, targetType: FlagTargetType;

    if (activity) {
      const userActivity = await UserActivity.findById(activity)
        .orFail(
          createError(
            dynamicMessage(ds.notFound, "Activity"),
            StatusCodes.NOT_FOUND,
          ),
        )
        .lean();

      if (!userActivity.resourceId) {
        throw createError(
          "Activity does not have a resourceId",
          StatusCodes.BAD_REQUEST,
        );
      }
      target = userActivity.resourceId;
      targetType = userActivity.resourceType as FlagTargetType;
    } else if (review) {
      await Review.exists({ _id: review }).orFail(
        createError(
          dynamicMessage(ds.notFound, "Review"),
          StatusCodes.NOT_FOUND,
        ),
      );

      target = review;
      targetType = ResourceTypeEnum.Review;
    } else if (comment) {
      await Comment.exists({ _id: comment }).orFail(
        createError(
          dynamicMessage(ds.notFound, "Review"),
          StatusCodes.NOT_FOUND,
        ),
      );
      target = comment;
      targetType = ResourceTypeEnum.Comment;
    } else if (homemade) {
      await Homemade.exists({ _id: homemade }).orFail(
        createError(
          dynamicMessage(ds.notFound, "Homemade"),
          StatusCodes.NOT_FOUND,
        ),
      );
      target = homemade;
      targetType = ResourceTypeEnum.Homemade;
    } else if (checkIn) {
      await CheckIn.exists({ _id: checkIn }).orFail(
        createError(
          dynamicMessage(ds.notFound, "CheckIn"),
          StatusCodes.NOT_FOUND,
        ),
      );
      target = checkIn;
      targetType = ResourceTypeEnum.CheckIn;
    } else {
      throw createError("No target provided", StatusCodes.BAD_REQUEST);
    }

    const newFlag = await Flag.create({
      user: authUser._id,
      target: target,
      targetType: targetType,
      flagType,
      note,
    });

    try {
      sendSlackMessage(
        "phantomAssistant",
        `${targetType} flagged!\nType: ${flagType}\nNote: ${note}`,
      );
    } catch (error) {
      logger.error("Error sending slack message", { error });
    }

    res.status(StatusCodes.CREATED).json(createResponse(newFlag));
  } catch (err) {
    next(err);
  }
}
