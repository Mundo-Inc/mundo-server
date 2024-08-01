import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import type { FilterQuery } from "mongoose";
import { z } from "zod";

import UserProjection from "../../../api/dto/user.js";
import Flag, { type IFlag } from "../../../models/Flag.js";
import Review from "../../../models/Review.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { getPaginationFromQuery } from "../../../utilities/pagination.js";
import { createResponse } from "../../../utilities/response.js";
import {
  validateData,
  zObjectId,
  zPaginationSpread,
} from "../../../utilities/validation.js";

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
  next: NextFunction,
) {
  try {
    const { review } = req.query as Query;

    const { page, limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 20,
      maxLimit: 50,
    });

    //check if review exists
    if (review) {
      await Review.exists({ _id: review }).orFail(
        createError("Review not found", StatusCodes.NOT_FOUND),
      );
    }

    const queryObj: FilterQuery<IFlag> = {
      adminAction: { $exists: false },
      ...(review ? { target: review } : {}),
    };

    const [totalDocuments, result] = await Promise.all([
      Flag.countDocuments(queryObj),
      Flag.find(queryObj)
        .sort("-createdAt")
        .skip(skip)
        .limit(limit)
        .populate("target")
        .populate("user", UserProjection.admin),
    ]);

    const response: IFlag[] = [];

    for (const flag of result) {
      if (!flag.target) {
        flag.deleteOne();
        continue;
      }

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

      response.push(flag);
    }

    res.status(StatusCodes.OK).json(
      createResponse(response, {
        totalCount: totalDocuments,
        page,
        limit,
      }),
    );
  } catch (err) {
    next(err);
  }
}
