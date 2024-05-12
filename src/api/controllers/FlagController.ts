import type { NextFunction, Request, Response } from "express";
import { body, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import CheckIn from "../../models/CheckIn";
import Comment from "../../models/Comment";
import Flag, { FlagTypeEnum } from "../../models/Flag";
import Homemade from "../../models/Homemade";
import Review from "../../models/Review";
import UserActivity from "../../models/UserActivity";
import { dStrings, dynamicMessage } from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import logger from "../services/logger";
import { sendSlackMessage } from "./SlackController";

export const createFlagValidation: ValidationChain[] = [
  body("activity").optional().isMongoId(),
  body("review").optional().isMongoId(),
  body("comment").optional().isMongoId(),
  body("homemade").optional().isMongoId(),
  body("checkIn").optional().isMongoId(),

  body("flagType").isIn(Object.keys(FlagTypeEnum)),
  body("note").optional().isString(),
];

export async function createFlag(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;
    const { note } = req.body;

    const flagType = req.body.flagType as FlagTypeEnum;

    const activity = req.body.activity
      ? new mongoose.Types.ObjectId(req.body.activity as string)
      : null;

    const comment = req.body.comment
      ? new mongoose.Types.ObjectId(req.body.comment as string)
      : null;

    const homemade = req.body.homemade
      ? new mongoose.Types.ObjectId(req.body.homemade as string)
      : null;

    const checkIn = req.body.checkIn
      ? new mongoose.Types.ObjectId(req.body.checkIn as string)
      : null;

    const review = req.body.review
      ? new mongoose.Types.ObjectId(req.body.review as string)
      : null;

    let target: mongoose.Types.ObjectId, targetType: string;

    if (activity) {
      const userActivity = await UserActivity.findById(activity)
        .orFail(
          createError(
            dynamicMessage(dStrings.notFound, "Activity"),
            StatusCodes.NOT_FOUND
          )
        )
        .lean();

      if (!userActivity.resourceId) {
        throw createError(
          "Activity does not have a resourceId",
          StatusCodes.BAD_REQUEST
        );
      }
      target = userActivity.resourceId;
      targetType = userActivity.resourceType;
    } else if (review) {
      await Review.exists({ _id: review }).orFail(
        createError(
          dynamicMessage(dStrings.notFound, "Review"),
          StatusCodes.NOT_FOUND
        )
      );

      target = review;
      targetType = "Review";
    } else if (comment) {
      await Comment.exists({ _id: comment }).orFail(
        createError(
          dynamicMessage(dStrings.notFound, "Review"),
          StatusCodes.NOT_FOUND
        )
      );
      target = comment;
      targetType = "Comment";
    } else if (homemade) {
      await Homemade.exists({ _id: homemade }).orFail(
        createError(
          dynamicMessage(dStrings.notFound, "Homemade"),
          StatusCodes.NOT_FOUND
        )
      );
      target = homemade;
      targetType = "Homemade";
    } else if (checkIn) {
      await CheckIn.exists({ _id: checkIn }).orFail(
        createError(
          dynamicMessage(dStrings.notFound, "CheckIn"),
          StatusCodes.NOT_FOUND
        )
      );
      target = checkIn;
      targetType = "CheckIn";
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
        `${targetType} flagged!\nType: ${flagType}\nNote: ${note}`
      );
    } catch (error) {
      logger.error("Error sending slack message", { error });
    }

    res.status(StatusCodes.CREATED).json({ success: true, data: newFlag }); // Send the ID of the created list as response
  } catch (err) {
    next(err);
  }
}
