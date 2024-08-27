import mongoose, { type PipelineStage } from "mongoose";

import Reaction from "../../../models/reaction.js";
import User, { type IUser } from "../../../models/user/user.js";
import UserActivity, {
  type IUserActivity,
  ResourcePrivacyEnum,
} from "../../../models/userActivity.js";

export async function getUniqueUserReactions(
  userId: mongoose.Types.ObjectId,
  fromDate?: Date,
): Promise<number> {
  // Step 1: Fetch all user activities of the authenticated user
  const userActivities = await UserActivity.find({ userId })
    .select<Pick<IUserActivity, "_id">>("_id")
    .lean();

  // Step 2: Aggregate reactions to count unique users for each activity
  const userActivityIds = userActivities.map((activity) => activity._id);
  const matchStage: PipelineStage.Match["$match"] = {
    target: { $in: userActivityIds },
  };

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

export async function getUserRanking(user: IUser): Promise<number> {
  const rank = await User.countDocuments({
    source: { $exists: false },
    "progress.xp": { $gt: user.progress.xp },
  }).sort({ createdAt: -1 });

  return rank + 1;
}

export async function getUserStreak(user: IUser): Promise<number> {
  const streak = Math.floor(
    (Date.now() - user.appUsage.streakStartDate.getTime()) /
      (1000 * 60 * 60 * 24),
  );

  return streak;
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
