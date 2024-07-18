import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import UserProjection from "@/api/dto/user.js";
import PrizeRedemption from "@/models/PrizeRedemption.js";
import User from "@/models/User.js";
import { dStrings as ds, dynamicMessage } from "@/strings.js";
import { createError } from "@/utilities/errorHandlers.js";
import { getPaginationFromQuery } from "@/utilities/pagination.js";
import { validateData, zPaginationSpread } from "@/utilities/validation.js";

const query = z.object(zPaginationSpread);

export const getPrizeRedemptionHistoryValidation = validateData({
  query: query,
});

export async function getPrizeRedemptionHistory(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = req.user!;

    const { page, limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 20,
      maxLimit: 50,
    });

    const user = await User.findById(authUser._id).orFail(
      createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND)
    );

    const [totalCount, redemptions] = await Promise.all([
      PrizeRedemption.countDocuments({ userId: user._id }),
      PrizeRedemption.find({
        userId: user._id,
      })
        .populate("userId", UserProjection.essentials)
        .sort({ _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    res.status(StatusCodes.OK).json({
      success: true,
      data: redemptions,
      pagination: {
        totalCount,
        page,
        limit,
      },
    });
  } catch (error) {
    next(error);
  }
}
