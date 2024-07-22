import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import UserProjection from "../../../api/dto/user.js";
import PrizeRedemption from "../../../models/PrizeRedemption.js";
import { getPaginationFromQuery } from "../../../utilities/pagination.js";
import {
  validateData,
  zPaginationSpread,
} from "../../../utilities/validation.js";

const query = z.object(zPaginationSpread);

export const getAllPrizeRedemptionHistoryValidation = validateData({
  query: query,
});

export async function getAllPrizeRedemptionHistory(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 20,
      maxLimit: 50,
    });

    const [totalCount, redemptions] = await Promise.all([
      PrizeRedemption.countDocuments(),
      PrizeRedemption.find({})
        .sort({ _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate("userId", UserProjection.private)
        .populate("prizeId")
        .lean(),
    ]);

    res.status(StatusCodes.OK).json({
      success: true,
      data: redemptions,
      pagination: {
        totalCount,
        page: req.query.page,
        limit: req.query.limit,
      },
    });
  } catch (error) {
    next(error);
  }
}
