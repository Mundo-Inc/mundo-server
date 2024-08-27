import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { createResponse } from "../../../utilities/response.js";
import {
  getUniqueUserReactions,
  getUserActivitiesWithMediaCount,
  getUserRanking,
  getUserStreak,
} from "./helpers.js";

export async function getUserStats(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const [
      userActivityWithMediaCount,
      gainedUniqueReactions,
      rank,
      dailyStreak,
    ] = await Promise.all([
      getUserActivitiesWithMediaCount(authUser._id),
      getUniqueUserReactions(authUser._id),
      getUserRanking(authUser),
      getUserStreak(authUser),
    ]);

    res.status(StatusCodes.OK).json(
      createResponse({
        userActivityWithMediaCount,
        gainedUniqueReactions,
        rank,
        dailyStreak,
        earnings: authUser.earnings,
      }),
    );
  } catch (err) {
    next(err);
  }
}
