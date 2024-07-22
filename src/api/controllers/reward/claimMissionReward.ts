import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import { populateMissionProgress } from "../../../api/services/reward/coinReward.service.js";
import CoinReward, { CoinRewardTypeEnum } from "../../../models/CoinReward.js";
import Mission from "../../../models/Mission.js";
import User from "../../../models/User.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const params = z.object({
  id: zObjectId,
});

type Params = z.infer<typeof params>;

export const claimMissionRewardValidation = validateData({
  params: params,
});

export async function claimMissionReward(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authUser = req.user!;

  const { id } = req.params as unknown as Params;

  try {
    const [user, mission] = await Promise.all([
      User.findById(authUser._id).orFail(
        createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND),
      ),
      Mission.findById(id).orFail(
        createError(
          dynamicMessage(ds.notFound, "Mission"),
          StatusCodes.NOT_FOUND,
        ),
      ),
    ]);

    const missionWithProgress = await populateMissionProgress(
      mission,
      user._id,
    );

    const isClaimable =
      missionWithProgress.progress.completed >=
      missionWithProgress.progress.total;

    if (!isClaimable) {
      throw createError(
        "Mission requirements are not done yet",
        StatusCodes.FORBIDDEN,
      );
    }

    const gotRewardBefore = await CoinReward.exists({
      userId: authUser._id,
      missionId: id,
    }).then((exists) => Boolean(exists));

    if (gotRewardBefore) {
      throw createError(
        "You have already got rewarded for this mission",
        StatusCodes.FORBIDDEN,
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

    res.status(StatusCodes.OK).json(createResponse(user));
  } catch (error) {
    next(error);
  }
}
