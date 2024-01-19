import { NextFunction, Request, Response } from "express";
import { ValidationChain } from "express-validator";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import User, { IUser } from "../../models/User";
import logger from "../services/logger";
import {
  applyDailyStreakResetIfNeeded,
  checkEligibleForDailyReward,
  getDailyRewardAmount,
  saveCoinReward,
  updateUserCoinsAndStreak,
} from "../services/reward/coinReward.service";
import { dailyCoinsCFG } from "../../config/dailyCoins";

export const dailyCoinInformationValidation: ValidationChain[] = [];
export async function dailyCoinInformation(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id: authId } = req.user!;
    let user = (await User.findById(authId)) as IUser;
    user = await applyDailyStreakResetIfNeeded(user);
    res
      .status(200)
      .json({
        success: true,
        data: {
          phantomCoins: user.phantomCoins,
          dailyRewards: dailyCoinsCFG.rewards,
        },
      });
  } catch (error) {
    next(error);
  }
}

export const claimDailyCoinsValidation: ValidationChain[] = [];

export async function claimDailyCoins(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const { id: authId } = req.user!;
    let user = (await User.findById(authId)) as IUser;
    const isEligible = checkEligibleForDailyReward(user.phantomCoins.daily);

    if (!isEligible) {
      throw createError(
        "You are ineligible to claim at this time, try again later.",
        400
      );
    }
    user = await applyDailyStreakResetIfNeeded(user);
    const rewardAmount = getDailyRewardAmount(user.phantomCoins.daily);
    // Update user's coins and streak
    await updateUserCoinsAndStreak(user, rewardAmount);

    await saveCoinReward(user, rewardAmount);

    res
      .status(200)
      .json({ success: true, data: { phantomCoins: user.phantomCoins } });
  } catch (error) {
    next(error);
  }
}

//TODO: REMOVE THIS FUNC
export async function updateUsersPhantomCoin() {
  try {
    // Find all users who don't have the 'phantomCoins' field
    const usersWithoutPhantomCoins = await User.find({
      phantomCoins: { $exists: false },
    });

    // Iterate over these users and update them
    const updatePromises = usersWithoutPhantomCoins.map((user) => {
      user.phantomCoins = {
        balance: 0,
        daily: { streak: 0 },
      };
      return user.save(); // Save each updated user
    });

    // Wait for all updates to complete
    await Promise.all(updatePromises);

    logger.verbose("Updated all users missing phantomCoins field.");
  } catch (error) {
    console.error("Error updating users: ", error);
  }
}
