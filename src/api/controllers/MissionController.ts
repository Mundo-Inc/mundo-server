import { NextFunction, Request, Response } from "express";
import { ValidationChain, body, param, query } from "express-validator";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import Mission, { IMission, TaskTypeEnum } from "../../models/Mission";
import User, { IUser } from "../../models/User";
import { populateMissionProgress } from "../services/reward/coinReward.service";
import CoinReward, { CoinRewardTypeEnum } from "../../models/CoinReward";

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

    res.status(200).json({
      success: true,
      data: { mission },
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

    const { id: authId } = req.user!;

    const user = await User.findById(authId);

    // Get page and limit from query parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10; // Default to 10 items per page
    const skip = (page - 1) * limit;

    const query = { expiresAt: { $lte: new Date() } };
    const missionsQuery = Mission.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get the total count for pagination
    const totalMissions = await Mission.countDocuments(query);

    const missions = ((await missionsQuery) as IMission[]).map((mission) => {
      return populateMissionProgress(mission, user);
    });

    res.status(200).json({
      success: true,
      data: missions,
      pagination: {
        page: page,
        limit: limit,
        totalPages: Math.ceil(totalMissions / limit),
        totalItems: totalMissions,
      },
    });
  } catch (error) {
    next(error);
  }
}

// this route is for admins to see older missions as well
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
    res.status(200).json({
      success: true,
      data: missions,
      pagination: {
        page: page,
        limit: limit,
        totalPages: Math.ceil(totalMissions / limit),
        totalItems: totalMissions,
      },
    });
  } catch (error) {
    next(error);
  }
}

export const deleteMissionValidation: ValidationChain[] = [
  param("id").isMongoId(),
];

export async function deleteMission(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { id } = req.params;
  try {
    await Mission.deleteOne({ _id: id });
    res.status(204);
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
  const { id: authId } = req.user!;
  try {
    const user = (await User.findById(authId)) as IUser;
    const mission = (await Mission.findById(id)) as IMission;
    const missionWithProgress = await populateMissionProgress(mission, user);

    if (!user) {
      throw createError("user not found", 404);
    }
    if (!mission) {
      throw createError("mission not found", 404);
    }

    const isClaimable =
      missionWithProgress.progress.completed >=
      missionWithProgress.progress.total;

    if (!isClaimable) {
      throw createError("Mission requirements are not done yet", 403);
    }

    const coinReward = await CoinReward.create({
      userId: authId,
      amount: mission.rewardAmount,
      coinRewardType: CoinRewardTypeEnum.mission,
      missionId: id,
    });

    user.phantomCoins.balance = user.phantomCoins.balance + coinReward.amount;
    await user.save();

    res.status(200).json({ success: true, data: { user } });
  } catch (error) {
    next(error);
  }
}
