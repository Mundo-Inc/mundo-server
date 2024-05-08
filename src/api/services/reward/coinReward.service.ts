import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import { dailyCoinsCFG } from "../../../config/dailyCoins";
import CheckIn from "../../../models/CheckIn";
import CoinReward, { CoinRewardTypeEnum } from "../../../models/CoinReward";
import { TaskTypeEnum, type IMission } from "../../../models/Mission";
import Reaction from "../../../models/Reaction";
import type { IDailyReward, IUser } from "../../../models/User";
import UserActivity, {
  ActivityResourceTypeEnum,
} from "../../../models/UserActivity";
import { dStrings, dynamicMessage } from "../../../strings";
import { createError } from "../../../utilities/errorHandlers";

const DAY_HOURS = 24;

export function checkEligibleForDailyReward(dailyRewards: IDailyReward) {
  if (!dailyRewards.lastClaim) return true;
  const now = new Date();
  const differenceInHours =
    (now.getTime() - dailyRewards.lastClaim.getTime()) / (1000 * 60 * 60);
  return differenceInHours >= DAY_HOURS;
}

export function getDailyRewardAmount(dailyRewards: IDailyReward): number {
  if (!dailyRewards.lastClaim) {
    return dailyCoinsCFG.rewards[0];
  }
  const streakIndex = Math.min(
    dailyRewards.streak,
    dailyCoinsCFG.rewards.length - 1
  );
  return dailyCoinsCFG.rewards[streakIndex];
}

export async function updateUserCoinsAndStreak(
  user: IUser,
  rewardAmount: number
) {
  if (!user) {
    throw createError(
      dynamicMessage(dStrings.notFound, "User"),
      StatusCodes.NOT_FOUND
    );
  }
  user.phantomCoins.balance += rewardAmount;
  const now = new Date();
  user.phantomCoins.daily.streak += 1;
  user.phantomCoins.daily.lastClaim = now;
  return await user.save();
}

export async function saveCoinReward(user: IUser, rewardAmount: number) {
  await CoinReward.create({
    userId: user._id,
    amount: rewardAmount,
    coinRewardType: CoinRewardTypeEnum.daily,
  });
}

export async function applyDailyStreakResetIfNeeded(user: IUser) {
  let updatedUser = user;
  if (user.phantomCoins.daily.lastClaim) {
    const now = new Date();
    const differenceInHours =
      (now.getTime() - user.phantomCoins.daily.lastClaim.getTime()) /
      (1000 * 60 * 60);
    if (
      differenceInHours >= 48 ||
      user.phantomCoins.daily.streak == dailyCoinsCFG.rewards.length
    ) {
      user.phantomCoins.daily.streak = 0;
      updatedUser = await user.save();
    }
  }
  return updatedUser;
}

export async function isMissionRewardClaimedByUser(
  mission: IMission,
  userId: mongoose.Types.ObjectId
) {
  const isClaimed = await CoinReward.countDocuments({
    userId: userId,
    missionId: mission._id,
  });
  return isClaimed > 0;
}

export async function populateMissionProgress(
  mission: IMission,
  userId: mongoose.Types.ObjectId
) {
  const isClaimed = await isMissionRewardClaimedByUser(mission, userId);
  const populatedMission = {
    ...mission,
    isClaimed,
    progress: {
      completed: 0,
      total: mission.task.count,
    },
  };
  if (mission.task.type === TaskTypeEnum.REACT) {
    const reactionAggregate = await Reaction.aggregate([
      {
        $match: {
          user: userId,
          createdAt: {
            $gte: mission.startsAt,
            $lte: mission.expiresAt,
          },
        },
      },
      {
        $group: {
          _id: "$target",
        },
      },
      {
        $count: "distinctTargets",
      },
    ]);
    const completedCount =
      reactionAggregate.length > 0 ? reactionAggregate[0].distinctTargets : 0;
    populatedMission.progress.completed = completedCount;
  }
  if (mission.task.type === TaskTypeEnum.CHECKIN) {
    const checkinAggregation = await CheckIn.aggregate([
      {
        $match: {
          user: userId,
          createdAt: {
            $gte: mission.startsAt,
            $lte: mission.expiresAt,
          },
        },
      },
      {
        $group: {
          _id: "$place",
        },
      },
      {
        $count: "distinctPlaces",
      },
    ]);
    const completedCount =
      checkinAggregation.length > 0 ? checkinAggregation[0].distinctPlaces : 0;
    populatedMission.progress.completed = completedCount;
  }
  if (mission.task.type === TaskTypeEnum.HAS_MEDIA) {
    const completedCount = await UserActivity.countDocuments({
      userId: userId,
      hasMedia: true,
      createdAt: {
        $gte: mission.startsAt,
        $lte: mission.expiresAt,
      },
    });
    populatedMission.progress.completed = completedCount;
  }
  if (mission.task.type === TaskTypeEnum.REVIEW) {
    const completedCount = await UserActivity.countDocuments({
      userId: userId,
      resourceType: ActivityResourceTypeEnum.REVIEW,
      createdAt: {
        $gte: mission.startsAt,
        $lte: mission.expiresAt,
      },
    });
    populatedMission.progress.completed = completedCount;
  }
  return populatedMission;
}
