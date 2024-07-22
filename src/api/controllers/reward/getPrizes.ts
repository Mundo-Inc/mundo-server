import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import Prize from "../../../models/Prize.js";

export async function getPrizes(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const prizes = await Prize.aggregate([
      {
        $lookup: {
          from: "prizeredemptions",
          localField: "_id",
          foreignField: "prizeId",
          as: "redemptionDetails",
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
        $sort: { createdAt: -1 },
      },
      {
        $project: {
          _id: 1,
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
