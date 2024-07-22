import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { applyDailyStreakResetIfNeeded } from "../../../api/services/reward/coinReward.service.js";
import { dailyCoinsCFG } from "../../../config/dailyCoins.js";
import User from "../../../models/User.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";

export async function dailyCoinInformation(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    let user = await User.findById(authUser._id).orFail(
      createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND),
    );

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
