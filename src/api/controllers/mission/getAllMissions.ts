import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import Mission from "../../../models/mission.js";
import { getPaginationFromQuery } from "../../../utilities/pagination.js";
import { createResponse } from "../../../utilities/response.js";

export async function getAllMissions(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { page, limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 20,
      maxLimit: 50,
    });

    const [missions, totalMissions] = await Promise.all([
      Mission.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Mission.countDocuments({}),
    ]);

    res.status(StatusCodes.OK).json(
      createResponse(missions, {
        totalCount: totalMissions,
        page: page,
        limit: limit,
      }),
    );
  } catch (error) {
    next(error);
  }
}
