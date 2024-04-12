import type { NextFunction, Request, Response } from "express";
import { body, param, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";

import CheckIn from "../../models/CheckIn";
import Comment from "../../models/Comment";
import Flag, { FlagTypeEnum, type IFlag } from "../../models/Flag";
import Homemade from "../../models/Homemade";
import Review from "../../models/Review";
import UserActivity, { type IUserActivity } from "../../models/UserActivity";
import { dStrings, dynamicMessage } from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import logger from "../services/logger";
import { sendSlackMessage } from "./SlackController";

export const createFlagValidation: ValidationChain[] = [
  body("activity").optional().isMongoId(),
  body("review").optional().isMongoId(),
  body("comment").optional().isMongoId(),
  body("homemade").optional().isMongoId(),
  body("checkin").optional().isMongoId(),

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

    const { id: authId } = req.user!;
    const { flagType, note, activity, review, comment, homemade, checkin } =
      req.body;

    let target: string, targetType: string;

    if (activity) {
      const userActivity: IUserActivity | null = await UserActivity.findById(
        activity
      ).lean();
      if (!userActivity) {
        throw createError(
          dynamicMessage(dStrings.notFound, "Activity"),
          StatusCodes.NOT_FOUND
        );
      }
      if (!userActivity.resourceId) {
        throw createError(
          "Activity does not have a resourceId",
          StatusCodes.BAD_REQUEST
        );
      }
      target = userActivity.resourceId.toString();
      targetType = userActivity.resourceType;
    } else if (review) {
      const reviewExists = await Review.exists({ _id: review });
      if (!reviewExists) {
        throw createError(
          dynamicMessage(dStrings.notFound, "Review"),
          StatusCodes.NOT_FOUND
        );
      }
      target = review;
      targetType = "Review";
    } else if (comment) {
      const commentExists = await Comment.exists({ _id: comment });
      if (!commentExists) {
        throw createError(
          dynamicMessage(dStrings.notFound, "Review"),
          StatusCodes.NOT_FOUND
        );
      }
      target = comment;
      targetType = "Comment";
    } else if (homemade) {
      const homemadeExists = await Homemade.exists({ _id: homemade });
      if (!homemadeExists) {
        throw createError(
          dynamicMessage(dStrings.notFound, "Homemade"),
          StatusCodes.NOT_FOUND
        );
      }
      target = homemade;
      targetType = "Homemade";
    } else if (checkin) {
      const checkinExists = await CheckIn.exists({ _id: checkin });
      if (!checkinExists) {
        throw createError(
          dynamicMessage(dStrings.notFound, "CheckIn"),
          StatusCodes.NOT_FOUND
        );
      }
      target = checkin;
      targetType = "CheckIn";
    } else {
      throw createError("No target provided", StatusCodes.BAD_REQUEST);
    }

    console.log("target", target, targetType);
    const newFlag = await Flag.create({
      user: authId,
      target: target,
      targetType: targetType,
      flagType,
      note,
    });

    // try {
    //   sendSlackMessage(
    //     "phantomAssistant",
    //     `${targetType} flagged!\nType: ${flagType}\nNote: ${note}`
    //   );
    // } catch (error) {
    //   logger.error("Error sending slack message", { error });
    // }

    res.status(StatusCodes.CREATED).json({ success: true, data: "newFlag" }); // Send the ID of the created list as response
  } catch (err) {
    next(err);
  }
}

// TODO: Delete after client is updated
export const createFlagReviewValidation: ValidationChain[] = [
  param("id").isMongoId(),
  body("flagType").isIn(Object.keys(FlagTypeEnum)),
  body("note").optional().isString(),
];

// TODO: Delete after client is updated
export async function createFlagReview(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const { id: authId } = req.user!;
    const { id } = req.params;
    const { flagType, note } = req.body;

    //check if review exists
    const reviewExists = await Review.exists({ _id: id });
    if (!reviewExists) {
      throw createError("Review not found", StatusCodes.NOT_FOUND);
    }

    const newFlag: IFlag = new Flag({
      user: authId,
      target: id,
      targetType: "Review",
      flagType,
      note,
    });
    await newFlag.save();

    try {
      sendSlackMessage(
        "phantomAssistant",
        `Review flagged!\nFlag type: ${flagType}\nNote: ${note}`
      );
    } catch (error) {
      logger.error("Error sending slack message", { error });
    }

    res.status(StatusCodes.CREATED).json({ success: true, data: newFlag }); // Send the ID of the created list as response
  } catch (err) {
    next(err);
  }
}

// TODO: Delete after client is updated
export const createFlagCommentValidation: ValidationChain[] = [
  param("id").isMongoId(),
  body("flagType").isIn(Object.keys(FlagTypeEnum)),
  body("note").optional().isString(),
];

// TODO: Delete after client is updated
export async function createFlagComment(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const { id: authId } = req.user!;
    const { id } = req.params;
    const { flagType, note } = req.body;

    //check if review exists
    const commentExists = await Comment.exists({ _id: id });
    if (!commentExists) {
      throw createError("Comment not found", StatusCodes.NOT_FOUND);
    }

    const newFlag: IFlag = new Flag({
      user: authId,
      target: id,
      targetType: "Comment",
      flagType,
      note,
    });
    await newFlag.save();

    try {
      sendSlackMessage(
        "phantomAssistant",
        `Comment flagged!\nFlag type: ${flagType}\nNote: ${note}`
      );
    } catch (error) {
      logger.error("Error sending slack message", { error });
    }

    res.status(StatusCodes.CREATED).json({ success: true, data: newFlag }); // Send the ID of the created list as response
  } catch (err) {
    next(err);
  }
}
