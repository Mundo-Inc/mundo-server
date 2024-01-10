import { dailyCoinsCFG } from "../../../config/dailyCoins";
import CoinReward, { CoinRewardTypeEnum } from "../../../models/CoinReward";
import { IDailyReward, IUser } from "../../../models/User";

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
    throw new Error("User not found");
  }
  user.phantomCoins.balance += rewardAmount;
  const now = new Date();
  user.phantomCoins.daily.streak += 1;
  user.phantomCoins.daily.lastClaim = now;
  return await user.save();
}

export async function saveCoinReward(user: IUser, rewardAmount: number) {
  const reward = await CoinReward.create({
    userId: user._id,
    amount: rewardAmount,
    coinRewardType: CoinRewardTypeEnum.daily,
  });

  await reward.save();
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
