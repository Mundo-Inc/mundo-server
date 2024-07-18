import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import type { PipelineStage } from "mongoose";

import { validateData, zPaginationSpread } from "@/utilities/validation.js";
import { getPaginationFromQuery } from "@/utilities/pagination.js";
import User from "@/models/User.js";
import UserProjection from "@/api/dto/user.js";
import { createError } from "@/utilities/errorHandlers.js";
import { dStrings as ds, dynamicMessage } from "@/strings.js";

const query = z.object({
  ...zPaginationSpread,
  signupMethod: z.string().optional(),
  q: z.string().optional(),
});

type Query = z.infer<typeof query>;

export const adminGetUsersValidation = validateData({
  query: query,
});

export async function adminGetUsers(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { q, signupMethod } = req.query as Query;

    const { page, limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 20,
      maxLimit: 50,
    });

    const matchObject: {
      [key: string]: any;
    } = {
      source: { $exists: false },
    };
    if (q) {
      matchObject["$or"] = [
        { name: { $regex: q, $options: "i" } },
        { username: { $regex: q, $options: "i" } },
      ];
    }
    if (signupMethod) {
      matchObject["signupMethod"] = signupMethod;
    }
    const matchPipeline: PipelineStage[] = [];
    if (Object.keys(matchObject).length !== 0) {
      matchPipeline.push({ $match: matchObject });
    }

    const result = await User.aggregate([
      ...matchPipeline,
      {
        $sort: {
          createdAt: -1,
        },
      },
      {
        $facet: {
          total: [{ $count: "count" }],
          users: [{ $skip: skip }, { $limit: limit }],
        },
      },
      {
        $project: {
          total: { $arrayElemAt: ["$total.count", 0] },
          users: UserProjection.admin,
        },
      },
    ]);

    const results = result[0];

    if (!results) {
      throw createError(
        dynamicMessage(ds.notFound, "User"),
        StatusCodes.NOT_FOUND
      );
    }

    res.status(StatusCodes.OK).json({
      success: true,
      data: results.users,
      pagination: {
        totalCount: results.total,
        page,
        limit,
      },
    });
  } catch (err) {
    next(err);
  }
}
