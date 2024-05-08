import type { NextFunction, Request, Response } from "express";
import { body, param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";

import CoinReward, { CoinRewardTypeEnum } from "../../models/CoinReward";
import Mission, { TaskTypeEnum, type IMission } from "../../models/Mission";
import Prize from "../../models/Prize";
import User, { type IUser } from "../../models/User";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { populateMissionProgress } from "../services/reward/coinReward.service";

export const createMissionValidation: ValidationChain[] = [
  body("title").isString(),
  body("subtitle").optional().isString(),
  body("icon").isString(),
  body("task").isObject(),
  body("task.type").isIn(Object.values(TaskTypeEnum)),
  body("task.count").isInt(),
  body("rewardAmount").isInt(),
  body("startsAt").custom((value) => {
    return !isNaN(Date.parse(value)); // Custom validator to check if the date string is valid
  }),
  body("expiresAt")
    .optional()
    .custom((value) => {
      return !isNaN(Date.parse(value)); // Similarly for expiresAt
    }),
];

export async function createMission(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    // Extract mission data from request body
    let { title, subtitle, icon, task, rewardAmount, startsAt, expiresAt } =
      req.body;

    startsAt = new Date(startsAt);
    expiresAt = expiresAt
      ? new Date(expiresAt)
      : new Date(startsAt.getTime() + 7 * 24 * 60 * 60 * 1000); // Add one week to startsAt if expiresAt is not provided

    const missionData = {
      title,
      subtitle,
      icon,
      task,
      rewardAmount,
      startsAt,
      expiresAt,
    };

    const mission = new Mission(missionData);

    await mission.save();

    res.status(StatusCodes.OK).json({
      success: true,
      data: mission,
    });
  } catch (error) {
    next(error);
  }
}

export const getMissionsValidation: ValidationChain[] = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page number must be at least 1"),
  query("limit")
    .optional()
    .isInt({ gt: 0 })
    .withMessage("Limit must be greater than 0"),
];

export async function getMissions(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    // Get page and limit from query parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10; // Default to 10 items per page
    const skip = (page - 1) * limit;

    const query = {
      expiresAt: { $gte: new Date() },
      startsAt: { $lte: new Date() },
    };

    const [missions, totalMissions] = await Promise.all([
      Mission.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Mission.countDocuments(query),
    ]);

    const populatedMissions = [];
    for (const mission of missions) {
      populatedMissions.push(
        await populateMissionProgress(mission as IMission, authUser._id)
      );
    }

    res.status(StatusCodes.OK).json({
      success: true,
      data: populatedMissions,
      pagination: {
        totalCount: totalMissions,
        page: page,
        limit: limit,
      },
    });
  } catch (error) {
    next(error);
  }
}

export const claimMissionRewardValidation: ValidationChain[] = [
  param("id").isMongoId(),
];

export async function claimMissionReward(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { id } = req.params;
  const authUser = req.user!;
  try {
    const user: IUser | null = await User.findById(authUser._id);
    if (!user) {
      throw createError("user not found", StatusCodes.NOT_FOUND);
    }

    const mission: IMission | null = await Mission.findById(id);
    if (!mission) {
      throw createError("mission not found", StatusCodes.NOT_FOUND);
    }

    const missionWithProgress = await populateMissionProgress(
      mission,
      user._id
    );

    const isClaimable =
      missionWithProgress.progress.completed >=
      missionWithProgress.progress.total;

    if (!isClaimable) {
      throw createError(
        "Mission requirements are not done yet",
        StatusCodes.FORBIDDEN
      );
    }

    const gotRewardBefore =
      (await CoinReward.countDocuments({
        userId: authUser._id,
        missionId: id,
      })) > 0;

    if (gotRewardBefore) {
      throw createError(
        "You have already got rewarded for this mission",
        StatusCodes.FORBIDDEN
      );
    }

    const coinReward = await CoinReward.create({
      userId: authUser._id,
      amount: mission.rewardAmount,
      coinRewardType: CoinRewardTypeEnum.mission,
      missionId: id,
    });

    user.phantomCoins.balance = user.phantomCoins.balance + coinReward.amount;
    await user.save();

    res.status(StatusCodes.OK).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}

export const getPrizesValidation: ValidationChain[] = [];

export async function getPrizes(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const prizes = await Prize.aggregate([
      {
        $lookup: {
          from: "prizeredemptions", // This should be the collection name of PrizeRedemption in your MongoDB
          localField: "_id", // Field in Prize collection
          foreignField: "prizeId", // Field in PrizeRedemption collection
          as: "redemptionDetails", // Alias for the output array containing the joined documents
        },
      },
      {
        $unwind: {
          path: "$redemptionDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: "$_id",
          title: { $first: "$title" },
          thumbnail: { $first: "$thumbnail" },
          amount: { $first: "$amount" },
          count: { $first: "$count" },
          createdAt: { $first: "$createdAt" },
          isRedeemed: {
            $first: {
              $cond: { if: "$redemptionDetails", then: true, else: false },
            },
          },
          status: { $first: "$redemptionDetails.status" },
        },
      },
      {
        $project: {
          title: 1,
          thumbnail: 1,
          amount: 1,
          count: 1,
          createdAt: 1,
          isRedeemed: 1,
          status: 1,
        },
      },
    ]);

    res.status(StatusCodes.OK).json({ success: true, data: prizes });
  } catch (error) {
    next(error);
  }
}

// admin only
export async function getAllMissions(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    // Get page and limit from query parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10; // Default to 10 items per page
    const skip = (page - 1) * limit;

    const missionsQuery = Mission.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    // Get the total count for pagination
    const totalMissions = await Mission.countDocuments({});
    const missions = await missionsQuery;
    res.status(StatusCodes.OK).json({
      success: true,
      data: missions,
      pagination: {
        totalCount: totalMissions,
        page: page,
        limit: limit,
      },
    });
  } catch (error) {
    next(error);
  }
}

export const deleteMissionValidation: ValidationChain[] = [
  param("id").isMongoId(),
];

// admin only
export async function deleteMission(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { id } = req.params;
  try {
    await Mission.deleteOne({ _id: id });
    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (error) {
    next(error);
  }
}

export const createPrizeValidation: ValidationChain[] = [
  body("title").isString(),
  body("thumbnail").isURL(),
  body("amount").isNumeric(),
  body("count").optional().isNumeric(),
];

// admin only
export async function createPrize(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { title, thumbnail, amount, count } = req.body;

    const prize = await Prize.create({
      title,
      thumbnail,
      amount,
      count,
    });

    res.status(StatusCodes.OK).json({
      succss: true,
      data: prize,
    });
  } catch (error) {
    next(error);
  }
}
