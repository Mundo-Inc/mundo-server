import type { NextFunction, Request, Response } from "express";
import type { ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";

import { dailyCoinsCFG } from "../../config/dailyCoins";
import User, { type IUser } from "../../models/User";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import logger from "../services/logger";
import {
  applyDailyStreakResetIfNeeded,
  checkEligibleForDailyReward,
  getDailyRewardAmount,
  saveCoinReward,
  updateUserCoinsAndStreak,
} from "../services/reward/coinReward.service";

export const dailyCoinInformationValidation: ValidationChain[] = [];
export async function dailyCoinInformation(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id: authId } = req.user!;
    let user: IUser | null = await User.findById(authId);

    if (!user) {
      throw createError("User not found", StatusCodes.NOT_FOUND);
    }

    user = await applyDailyStreakResetIfNeeded(user);
    res.status(StatusCodes.OK).json({
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
    let user: IUser | null = await User.findById(authId);

    if (!user) {
      throw createError("User not found", StatusCodes.NOT_FOUND);
    }

    const isEligible = checkEligibleForDailyReward(user.phantomCoins.daily);

    if (!isEligible) {
      throw createError(
        "You are ineligible to claim at this time, try again later.",
        StatusCodes.BAD_REQUEST
      );
    }
    user = await applyDailyStreakResetIfNeeded(user);
    const rewardAmount = getDailyRewardAmount(user.phantomCoins.daily);
    // Update user's coins and streak
    await updateUserCoinsAndStreak(user, rewardAmount);

    await saveCoinReward(user, rewardAmount);

    res
      .status(StatusCodes.OK)
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
