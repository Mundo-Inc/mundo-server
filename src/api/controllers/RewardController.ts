import type { NextFunction, Request, Response } from "express";
import { param, type ValidationChain } from "express-validator";
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
import strings from "../../strings";
import Prize, { IPrize } from "../../models/Prize";
import PrizeRedemption from "../../models/PrizeRedemption";

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

export const redeemPrizeValidation: ValidationChain[] = [
  param("id").isMongoId(),
];
export async function redeemPrize(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const { id: authId } = req.user!;
    const { id } = req.params;
    const user = (await User.findById(authId)) as IUser;
    if (!user) {
      throw createError(strings.user.notFound, StatusCodes.NOT_FOUND);
    }
    const prize = (await Prize.findById(id)) as IPrize;
    if (!prize) {
      throw createError("prize not found", StatusCodes.NOT_FOUND);
    }

    if (prize.count <= 0) {
      throw createError("prize was finished", StatusCodes.BAD_REQUEST);
    }

    if (
      !user.phantomCoins.balance ||
      user.phantomCoins.balance < prize.amount
    ) {
      throw createError("insufficient balance", StatusCodes.BAD_REQUEST);
    }

    user.phantomCoins.balance = user.phantomCoins.balance - prize.amount;
    await user.save();

    const prizeRedemption = await PrizeRedemption.create({
      userId: user._id,
      prizeId: prize._id,
    });

    await prizeRedemption.save();

    res.status(200).json({
      success: true,
      data: prizeRedemption,
    });
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
