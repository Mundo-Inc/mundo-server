import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import { populateMissionProgress } from "../../../api/services/reward/coinReward.service.js";
import Mission from "../../../models/Mission.js";
import { getPaginationFromQuery } from "../../../utilities/pagination.js";
import {
  validateData,
  zPaginationSpread,
} from "../../../utilities/validation.js";

const query = z.object(zPaginationSpread);

export const getMissionsValidation = validateData({
  query: query,
});

export async function getMissions(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
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
        await populateMissionProgress(mission, authUser._id),
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
