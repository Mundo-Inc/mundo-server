import type { NextFunction, Request, Response } from "express";
import { body, param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";

import { dailyCoinsCFG } from "../../config/dailyCoins";
import Prize, { type IPrize } from "../../models/Prize";
import PrizeRedemption, {
  PrizeRedemptionStatusTypeEnum,
  type IPrizeRedemption,
} from "../../models/PrizeRedemption";
import User, { type IUser } from "../../models/User";
import strings, { dStrings, dynamicMessage } from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import UserProjection from "../dto/user/user";
import { BrevoService } from "../services/brevo.service";
import logger from "../services/logger";
import {
  applyDailyStreakResetIfNeeded,
  checkEligibleForDailyReward,
  getDailyRewardAmount,
  saveCoinReward,
  updateUserCoinsAndStreak,
} from "../services/reward/coinReward.service";
import validate from "./validators";

export const dailyCoinInformationValidation: ValidationChain[] = [];
export async function dailyCoinInformation(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = req.user!;
    let user: IUser | null = await User.findById(authUser._id);

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
    const authUser = req.user!;
    let user: IUser | null = await User.findById(authUser._id);

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

async function notifyRedemptionInProgress(user: IUser, prize: IPrize) {
  try {
    // Sending email notification
    const receivers = [{ email: user.email.address }];
    const sender = { email: "admin@phantomphood.com", name: "Phantom Phood" };
    const subject = "PhantomPhood - Prize Redemption";
    const brevoService = new BrevoService();
    const prizeTitle = prize.title;
    const prizeAmount = prize.amount;
    const name = user.name;
    await brevoService.sendTemplateEmail(
      receivers,
      subject,
      sender,
      "redemption-in-progress.handlebars",
      {
        name,
        prizeTitle,
        prizeAmount,
      }
    );
  } catch (error) {
    logger.error("error while sending email for redemption");
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
    const authUser = req.user!;
    const { id } = req.params;
    const user: IUser | null = await User.findById(authUser._id);
    if (!user) {
      throw createError(strings.user.notFound, StatusCodes.NOT_FOUND);
    }
    const prize: IPrize | null = await Prize.findById(id);
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

    prize.count = prize.count - 1;
    await prize.save();

    const prizeRedemption = await PrizeRedemption.create({
      userId: user._id,
      prizeId: prize._id,
    });

    await prizeRedemption.save();

    // notify them that they redemption is in verification progress
    await notifyRedemptionInProgress(user, prize);

    res.status(StatusCodes.OK).json({
      success: true,
      data: prizeRedemption,
    });
  } catch (error) {
    next(error);
  }
}

export const getPrizeRedemptionHistoryValidation: ValidationChain[] = [
  validate.page(query("page").optional(), 50),
  validate.limit(query("limit").optional(), 1, 50),
];
export async function getPrizeRedemptionHistory(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = req.user!;
    const user: IUser | null = await User.findById(authUser._id);
    const { page: reqPage, limit: reqLimit } = req.query;
    const page = parseInt(reqPage as string) || 1;
    const limit = parseInt(reqLimit as string) || 500;
    const skip = (page - 1) * limit;

    if (!user) {
      throw createError("User not found", StatusCodes.NOT_FOUND);
    }

    const redemptions = await PrizeRedemption.find({
      userId: user._id,
    })
      .populate("userId", UserProjection.essentials)
      .sort({ _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.status(StatusCodes.OK).json({ success: true, data: redemptions });
  } catch (error) {
    next(error);
  }
}

export const getAllPrizeRedemptionHistoryValidation: ValidationChain[] = [
  validate.page(query("page").optional(), 50),
  validate.limit(query("limit").optional(), 1, 50),
];
export async function getAllPrizeRedemptionHistory(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { page: reqPage, limit: reqLimit } = req.query;
    const page = parseInt(reqPage as string) || 1;
    const limit = parseInt(reqLimit as string) || 500;
    const skip = (page - 1) * limit;

    const redemptions = await PrizeRedemption.find({})
      .sort({ _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate("userId", UserProjection.private)
      .populate("prizeId")
      .lean();

    res.status(StatusCodes.OK).json({ success: true, data: redemptions });
  } catch (error) {
    next(error);
  }
}

export const reviewRedemptionValidation: ValidationChain[] = [
  query("id").isMongoId(),
  body("validation").isIn(Object.values(PrizeRedemptionStatusTypeEnum)),
  body("note").optional().isString(),
];
export async function reviewRedemption(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    const { validation, note } = req.body;

    const redemption: IPrizeRedemption | null = await PrizeRedemption.findById(
      id
    );
    if (!redemption) {
      throw createError("Prize Redemption Not Found", StatusCodes.NOT_FOUND);
    }
    if (redemption.status !== PrizeRedemptionStatusTypeEnum.PENDING) {
      throw createError(
        "Prize Redemption Is Already Verified as " + redemption.status,
        StatusCodes.BAD_REQUEST
      );
    }

    const prize: IPrize | null = await Prize.findById(redemption.prizeId);

    if (!prize) {
      throw createError(
        dynamicMessage(dStrings.notFound, "Prize"),
        StatusCodes.NOT_FOUND
      );
    }

    const user: IUser | null = await User.findById(redemption.userId);
    if (!user) {
      throw createError(
        dynamicMessage(dStrings.notFound, "User"),
        StatusCodes.NOT_FOUND
      );
    }

    switch (validation) {
      case PrizeRedemptionStatusTypeEnum.SUCCESSFUL:
        //TODO: send notification to the user that you have received the reward
        if (note) {
          redemption.note = note;
        }
        break;

      case PrizeRedemptionStatusTypeEnum.DECLINED:
        user.phantomCoins.balance = user.phantomCoins.balance + prize.amount;
        prize.count = prize.count + 1;
        await user.save();
        await prize.save();
        break;
    }
    redemption.status = validation;
    await redemption.save();

    res.status(StatusCodes.OK).json({
      success: true,
      data: redemption,
    });
  } catch (error) {
    next(error);
  }
}

export const paginationValidation: ValidationChain[] = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be at least 1"),
  query("limit")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Limit must be at least 1"),
];

export async function getLatestReferredUsers(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = req.user!;

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const latestReferredUsers = await User.find({ referredBy: authUser._id })
      .sort({ createdAt: -1 })
      .select(UserProjection.essentials)
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments({ referredBy: authUser._id });

    res.json({
      success: true,
      data: latestReferredUsers,
      pagination: {
        totalCount: total,
        page,
        limit,
      },
    });
  } catch (error) {
    next(error);
  }
}
