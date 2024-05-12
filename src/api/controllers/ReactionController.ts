import type { NextFunction, Request, Response } from "express";
import { body, param, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import { Types } from "mongoose";

import Notification, { ResourceTypeEnum } from "../../models/Notification";
import Reaction from "../../models/Reaction";
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

    const reaction: string = req.body.reaction;
    const type: "emoji" | "special" = req.body.type;
    const target = new Types.ObjectId(req.body.target as string);

    const existingReaction = await Reaction.findOne({
      user: authUser._id,
      target,
      type,
      reaction,
    }).lean();

    if (existingReaction) {
      throw createError(
        dynamicMessage(ds.alreadyExists, "Reaction"),
        StatusCodes.CONFLICT
      );
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

    const id = new Types.ObjectId(req.params.id);

    const reaction = await Reaction.findById(id).orFail(
      createError(
        dynamicMessage(ds.notFound, "Reaction"),
        StatusCodes.NOT_FOUND
      )
    );

    if (!reaction.user.equals(authUser._id)) {
      throw createError(
        "You are not authorized to perform this action",
        StatusCodes.FORBIDDEN
      );
    }

    await Reaction.deleteOne({ _id: id, user: authUser._id });
    await UserActivity.updateOne(
      { _id: reaction.target },
      { $inc: { "engagements.reactions": -1 } }
    );

    await removeAssociatedNotifications(id);

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}

async function removeAssociatedNotifications(reactionId: Types.ObjectId) {
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
