import type { NextFunction, Request, Response } from "express";
import { body, param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import CoinReward, { CoinRewardTypeEnum } from "../../models/CoinReward.js";
import Mission, { TaskTypeEnum } from "../../models/Mission.js";
import Prize from "../../models/Prize.js";
import User from "../../models/User.js";
import { dStrings, dynamicMessage } from "../../strings.js";
import {
  createError,
  handleInputErrors,
} from "../../utilities/errorHandlers.js";
import { getPaginationFromQuery } from "../../utilities/pagination.js";
import { populateMissionProgress } from "../services/reward/coinReward.service.js";
import validate from "./validators.js";

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
  validate.page(query("page").optional(), 100),
  validate.limit(query("limit").optional(), 1, 50),
];

export async function getMissions(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const { page, limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 20,
      maxLimit: 50,
    });

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
        await populateMissionProgress(mission, authUser._id)
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
  handleInputErrors(req);

  const authUser = req.user!;

  const id = new mongoose.Types.ObjectId(req.params.id);

  try {
    const [user, mission] = await Promise.all([
      User.findById(authUser._id).orFail(
        createError(
          dynamicMessage(dStrings.notFound, "User"),
          StatusCodes.NOT_FOUND
        )
      ),
      Mission.findById(id).orFail(
        createError(
          dynamicMessage(dStrings.notFound, "Mission"),
          StatusCodes.NOT_FOUND
        )
      ),
    ]);

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

    const gotRewardBefore = await CoinReward.exists({
      userId: authUser._id,
      missionId: id,
    }).then((exists) => Boolean(exists));

    if (gotRewardBefore) {
      throw createError(
        "You have already got rewarded for this mission",
        StatusCodes.FORBIDDEN
      );
    }

    const coinReward = await CoinReward.create({
      userId: authUser._id,
      amount: mission.rewardAmount,
      coinRewardType: CoinRewardTypeEnum.Mission,
      missionId: id,
    });

    user.phantomCoins.balance = user.phantomCoins.balance + coinReward.amount;
    await user.save();

    res.status(StatusCodes.OK).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}

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

    const { page, limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 20,
      maxLimit: 50,
    });

    const [missions, totalMissions] = await Promise.all([
      Mission.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Mission.countDocuments({}),
    ]);

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
  try {
    handleInputErrors(req);

    const id = new mongoose.Types.ObjectId(req.params.id);

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
