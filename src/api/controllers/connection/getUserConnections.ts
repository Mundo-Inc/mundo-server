import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import UserProjection from "@/api/dto/user.js";
import Follow from "@/models/Follow.js";
import User from "@/models/User.js";
import { dStrings as ds, dynamicMessage } from "@/strings.js";
import { createError } from "@/utilities/errorHandlers.js";
import { getPaginationFromQuery } from "@/utilities/pagination.js";
import {
  validateData,
  zObjectId,
  zPaginationSpread,
} from "@/utilities/validation.js";

const params = z.object({
  id: zObjectId,
  type: z.enum(["followers", "followings"]),
});
const query = z.object(zPaginationSpread);

type Params = z.infer<typeof params>;

export const getUserConnectionsValidation = validateData({
  params: params,
  query: query,
});

export async function getUserConnections(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = req.user!;

    const { id, type } = req.params as unknown as Params;

    const { page, limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 50,
      maxLimit: 100,
    });

    await User.exists(id).orFail(
      createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND)
    );

    const data = await Follow.aggregate([
      {
        $match: {
          [type === "followers" ? "target" : "user"]: id,
        },
      },
      {
        $facet: {
          total: [
            {
              $count: "total",
            },
          ],
          connections: [
            {
              $skip: skip,
            },
            {
              $limit: limit,
            },
            {
              $lookup: {
                from: "users",
                localField: type === "followers" ? "user" : "target",
                foreignField: "_id",
                as: "user",
                pipeline: [
                  {
                    $project: UserProjection.essentials,
                  },
                ],
              },
            },
            {
              $unwind: "$user",
            },
            {
              $project: {
                user: 1,
                createdAt: 1,
              },
            },
          ],
        },
      },
      {
        $project: {
          total: {
            $arrayElemAt: ["$total.total", 0],
          },
          connections: 1,
        },
      },
    ]).then((result) => result[0]);

    res.status(StatusCodes.OK).json({
      success: true,
      data: data?.connections || [],
      pagination: {
        totalCount: data?.total || 0,
        page: page,
        limit: limit,
      },
    });
  } catch (err) {
    next(err);
  }
}
