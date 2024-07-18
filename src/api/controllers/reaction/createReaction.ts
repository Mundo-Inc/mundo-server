import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import { addReward } from "@/api/services/reward/reward.service.js";
import Reaction from "@/models/Reaction.js";
import UserActivity from "@/models/UserActivity.js";
import { dStrings as ds, dynamicMessage } from "@/strings.js";
import { createError } from "@/utilities/errorHandlers.js";
import { validateData, zObjectId } from "@/utilities/validation.js";

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
  next: NextFunction
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
