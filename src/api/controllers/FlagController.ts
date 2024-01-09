import type { NextFunction, Request, Response } from "express";
import { type ValidationChain, body, param } from "express-validator";
import { StatusCodes } from "http-status-codes";

import Comment from "../../models/Comment";
import Flag, { FlagTypeEnum, IFlag } from "../../models/Flag";
import Review from "../../models/Review";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { sendSlackMessage } from "./SlackController";

export const createFlagReviewValidation: ValidationChain[] = [
  param("id").isMongoId(),
  body("flagType").isIn(Object.keys(FlagTypeEnum)),
  body("note").optional().isString(),
];

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
      console.log(error);
    }

    res.status(StatusCodes.CREATED).json({ success: true, data: newFlag }); // Send the ID of the created list as response
  } catch (err) {
    next(err);
  }
}

export const createFlagCommentValidation: ValidationChain[] = [
  param("id").isMongoId(),
  body("flagType").isIn(Object.keys(FlagTypeEnum)),
  body("note").optional().isString(),
];

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
      console.log(error);
    }

    res.status(StatusCodes.CREATED).json({ success: true, data: newFlag }); // Send the ID of the created list as response
  } catch (err) {
    next(err);
  }
}
