import { NextFunction, Request, Response } from "express";
import { ValidationChain, body, query } from "express-validator";
import { handleInputErrors } from "../../utilities/errorHandlers";
import Mission, { TaskTypeEnum } from "../../models/Mission";
import User, { IUser } from "../../models/User";

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

// ADD page and limit for these functions to have pagination

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
    const user = (await User.findById(authId)) as IUser;
    const isAdmin = user.role == "admin";

    // Get page and limit from query parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10; // Default to 10 items per page
    const skip = (page - 1) * limit;

    const query = isAdmin ? {} : { expiresAt: { $lte: new Date() } };
    const missionsQuery = Mission.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get the total count for pagination
    const totalMissions = await Mission.countDocuments(query);

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
