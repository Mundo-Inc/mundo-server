import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import { addReward } from "../../../api/services/reward/reward.service.js";
import Reaction from "../../../models/Reaction.js";
import UserActivity from "../../../models/UserActivity.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";
import {
  addEarnings,
  EarningsType,
  UNIQUE_USERS_REQUIRED_TO_REWARD,
} from "../../services/earning.service.js";

const body = z.object({
  target: zObjectId,
  type: z.enum(["emoji", "special"]),
  reaction: z.string(),
});

type Body = z.infer<typeof body>;

export const createReactionValidation = validateData({
  body: body,
});

export async function createReaction(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { target, type, reaction } = req.body as Body;

    const existingReaction = await Reaction.findOne({
      user: authUser._id,
      target,
      type,
      reaction,
    }).lean();

    if (existingReaction) {
      throw createError(
        dynamicMessage(ds.alreadyExists, "Reaction"),
        StatusCodes.CONFLICT,
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
      { $inc: { "engagements.reactions": 1 } },
    );

    // adding reward
    // TODO: use websocket to send reward changes
    const reward = await addReward(authUser._id, {
      refType: "Reaction",
      refId: newReaction._id,
      userActivityId: target,
    });

    const userActivity = await UserActivity.findById(target).orFail(
      createError(
        dynamicMessage(ds.notFound, "User Activity"),
        StatusCodes.NOT_FOUND,
      ),
    );
    // Check if the user is already in the uniqueReactions list
    if (
      !userActivity.uniqueReactions.some(
        (id) => id.toString() === authUser._id.toString(),
      )
    ) {
      userActivity.uniqueReactions.push(authUser._id);
    }
    // Save the user activity
    await userActivity.save();

    const uniqueReactionCount = userActivity.uniqueReactions.length;
    if (uniqueReactionCount % UNIQUE_USERS_REQUIRED_TO_REWARD === 0) {
      // Reward the user who created the post
      await addEarnings(userActivity.userId, EarningsType.GAINED_REACTIONS);
    }

    res.status(StatusCodes.CREATED).json(createResponse(newReaction));
  } catch (err) {
    next(err);
  }
}
