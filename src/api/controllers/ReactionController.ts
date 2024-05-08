import type { NextFunction, Request, Response } from "express";
import { body, param, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import { Types } from "mongoose";

import Notification, { ResourceTypeEnum } from "../../models/Notification";
import Reaction, { type IReaction } from "../../models/Reaction";
import UserActivity from "../../models/UserActivity";
import strings, { dStrings as ds, dynamicMessage } from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import logger from "../services/logger";
import { addReward } from "../services/reward/reward.service";

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

    const authUser = req.user!;

    const { target, type, reaction } = req.body;

    const existingReaction = await Reaction.findOne({
      user: authUser._id,
      target,
      type,
      reaction,
    }).lean();

    if (existingReaction) {
      throw createError(strings.data.duplicate, StatusCodes.CONFLICT);
    }

    const newReaction = await Reaction.create({
      user: authUser._id,
      target,
      type,
      reaction,
    });
    // update reaction count in user activity
    await UserActivity.updateOne(
      { _id: target },
      { $inc: { "engagements.reactions": 1 } }
    );

    // adding reward
    const reward = await addReward(authUser._id, {
      refType: "Reaction",
      refId: newReaction._id,
      userActivityId: target,
    });

    res
      .status(StatusCodes.CREATED)
      .json({ success: true, data: newReaction, reward: reward });
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

    const authUser = req.user!;
    const { id } = req.params;

    const reaction = await findReactionById(id);
    validateReactionOwnership(reaction, authUser._id);

    await removeReaction(new Types.ObjectId(id), authUser._id);
    await updateUserActivity(reaction.target);
    await removeAssociatedNotifications(id);

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}

async function findReactionById(id: string) {
  const reaction = await Reaction.findById(id);
  if (!reaction) {
    logger.debug("reaction not found");
    throw createError(
      dynamicMessage(ds.notFound, "Reaction"),
      StatusCodes.NOT_FOUND
    );
  }
  return reaction;
}

function validateReactionOwnership(
  reaction: IReaction,
  userId: Types.ObjectId
) {
  if (!reaction.user.equals(userId)) {
    logger.debug("not authorized for this action");
    throw createError(strings.authorization.userOnly, StatusCodes.FORBIDDEN);
  }
}

async function removeReaction(
  reactionId: Types.ObjectId,
  userId: Types.ObjectId
) {
  const result = await Reaction.deleteOne({ _id: reactionId, user: userId });
  if (result.deletedCount === 0) {
    throw createError(
      strings.general.deleteFailed,
      StatusCodes.INTERNAL_SERVER_ERROR
    );
  }
}

async function updateUserActivity(targetId: string) {
  await UserActivity.updateOne(
    { _id: targetId },
    { $inc: { "engagements.reactions": -1 } }
  );
}

async function removeAssociatedNotifications(reactionId: string) {
  try {
    await Notification.deleteMany({
      resources: {
        $elemMatch: { type: ResourceTypeEnum.REACTION, _id: reactionId },
      },
    });
  } catch (e) {
    logger.error(`Something happened during delete reaction`, { error: e });
    throw e;
  }
}
