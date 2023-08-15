import type { NextFunction, Request, Response } from "express";
import { body, param, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";

import Reaction from "../../models/Reaction";
import strings, { dStrings as ds, dynamicMessage } from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { addCreateReactionXP } from "../services/ranking.service";
import Notification, {
  NotificationType,
  ResourceTypes,
} from "../../models/Notification";

export const createReactionValidation: ValidationChain[] = [
  body("target").isMongoId(),
  body("type").isIn(["emoji", "special"]),
  body("reaction").isString(),
];
export async function createReaction(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: authId } = req.user!;

    const { target, type, reaction } = req.body;

    const existingReaction = await Reaction.findOne({
      user: authId,
      target,
      type,
      reaction,
    }).lean();

    if (existingReaction) {
      throw createError(strings.data.duplicate, StatusCodes.CONFLICT);
    }

    const newReaction = await Reaction.create({
      user: authId,
      target,
      type,
      reaction,
    });

    try {
      // await updateUserFeature(userId, reaction, req.body.targetType);
      await addCreateReactionXP(authId);
    } catch (e) {
      console.log(`Something happened during create reaction: ${e}`);
    }

    res.status(StatusCodes.CREATED).json({ success: true, data: newReaction });
  } catch (err) {
    next(err);
  }
}

export const deleteReactionValidation: ValidationChain[] = [
  param("id").isMongoId(),
];
export async function deleteReaction(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: authId } = req.user!;
    const { id } = req.params;

    const reaction = await Reaction.findById(id);

    if (!reaction) {
      throw createError(
        dynamicMessage(ds.notFound, "Reaction"),
        StatusCodes.NOT_FOUND
      );
    }

    // Check if the reaction belongs to the authenticated user
    if (reaction.user.toString() !== authId) {
      throw createError(strings.authorization.userOnly, StatusCodes.FORBIDDEN);
    }

    const deletedReaction = await Reaction.deleteOne({
      _id: id,
      user: authId,
    });

    if (deletedReaction.deletedCount === 0) {
      throw createError(
        strings.general.deleteFailed,
        StatusCodes.INTERNAL_SERVER_ERROR
      );
    }

    try {
      await Notification.deleteMany({
        resources: {
          $elemMatch: {
            type: ResourceTypes.REACTION,
            _id: id,
          },
        },
      });
    } catch (e) {
      console.log(`Something happened during delete reaction: ${e}`);
    }

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}
