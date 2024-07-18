import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import UserProjection from "@/api/dto/user.js";
import Flag from "@/models/Flag.js";
import Review from "@/models/Review.js";
import { createError } from "@/utilities/errorHandlers.js";
import { getPaginationFromQuery } from "@/utilities/pagination.js";
import {
  validateData,
  zObjectId,
  zPaginationSpread,
} from "@/utilities/validation.js";

const query = z.object({
  ...zPaginationSpread,
  review: zObjectId.optional(),
});

type Query = z.infer<typeof query>;

export const getFlagsValidation = validateData({
  query: query,
});

export async function getFlags(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { review } = req.query as Query;

    const { page, limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 20,
      maxLimit: 50,
    });

    //check if review exists
    if (review) {
      const reviewExists = await Review.exists({ _id: review });
      if (!reviewExists) {
        throw createError("Review not found", StatusCodes.NOT_FOUND);
      }
    }
    // Create a query object to filter the results based on the "review" query parameter if it's set
    const queryObj = review
      ? {
          target: review,
          adminAction: { $exists: false },
        }
      : { adminAction: { $exists: false } };

    const [totalDocuments, result] = await Promise.all([
      Flag.countDocuments(queryObj),
      Flag.find(queryObj)
        .sort("-createdAt")
        .skip(skip)
        .limit(limit)
        .populate("target")
        .populate("user", UserProjection.admin),
    ]);

    for (const flag of result) {
      switch (flag.targetType) {
        case "Review":
          await Promise.all([
            flag.populate("target.writer", UserProjection.private),
            flag.populate("target.media", "_id src caption type"),
          ]);
          break;
        case "Comment":
          await flag.populate("target.author", UserProjection.private);
          break;
        case "CheckIn":
          await flag.populate("target.user", UserProjection.private);
          break;
        case "Homemade":
          await flag.populate("target.user", UserProjection.private);
          break;
        default:
          break;
      }
    }

    res.status(StatusCodes.OK).json({
      success: true,
      data: result,
      pagination: {
        totalCount: totalDocuments,
        page,
        limit,
      },
    });
  } catch (err) {
    next(err);
  }
}
