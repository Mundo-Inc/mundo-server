import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import mongoose from "mongoose";
import Reaction from "../../../models/Reaction.js";
import User from "../../../models/User.js";
import UserActivity, {
  ResourcePrivacyEnum,
} from "../../../models/UserActivity.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";

export async function getUniqueUserReactions(
  userId: mongoose.Types.ObjectId,
  fromDate?: Date,
): Promise<number> {
  // Step 1: Fetch all user activities of the authenticated user
  const userActivities = await UserActivity.find({ userId })
    .select("_id")
    .lean();

  // Step 2: Aggregate reactions to count unique users for each activity
  const userActivityIds = userActivities.map((activity) => activity._id);
  const matchStage: any = { target: { $in: userActivityIds } };

  if (fromDate) {
    matchStage.createdAt = { $gte: fromDate };
  }

  const reactionAggregation = await Reaction.aggregate([
    { $match: matchStage },
    { $group: { _id: "$target", uniqueUsers: { $addToSet: "$user" } } },
    { $project: { count: { $size: "$uniqueUsers" } } },
  ]);

  // Step 3: Sum the unique counts for each activity
  const uniqueReactionsCount = reactionAggregation.reduce(
    (acc, curr) => acc + curr.count,
    0,
  );

  return uniqueReactionsCount;
}

export async function getUserRanking(
  userId: mongoose.Types.ObjectId,
): Promise<number> {
  // Step 1: Fetch user progress (XP)
  const user = await User.findById(userId)
    .orFail(
      createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND),
    )
    .select("progress.xp")
    .lean();

  // Step 2: Calculate the user's rank based on XP
  const rank = await User.countDocuments({
    source: { $exists: false },
    "progress.xp": { $gt: user.progress.xp },
  }).sort({ createdAt: -1 });

  return rank + 1;
}

export async function getUserStreak(
  userId: mongoose.Types.ObjectId,
): Promise<number> {
  const user = await User.findById(userId)
    .orFail(
      createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND),
    )
    .select("appUsage")
    .lean();

  return user.appUsage.streak.currentStreak;
}

export async function getUserActivitiesWithMediaCount(
  userId: mongoose.Types.ObjectId,
): Promise<number> {
  return await UserActivity.countDocuments({
    userId: userId,
    hasMedia: true,
    resourcePrivacy: ResourcePrivacyEnum.Public,
  });
}

export async function getUserStats(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const [userActivityWithMediaCount, uniqueReactionsCount, rank, streak] =
      await Promise.all([
        getUserActivitiesWithMediaCount(authUser._id),
        getUniqueUserReactions(authUser._id),
        getUserRanking(authUser._id),
        getUserStreak(authUser._id),
      ]);

    res
      .status(StatusCodes.OK)
      .json({ userActivityWithMediaCount, uniqueReactionsCount, rank, streak });
  } catch (err) {
    next(err);
  }
}
