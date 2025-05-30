import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import {
  type UserProjectionType,
  UserProjection,
} from "../../../api/dto/user.js";
import User from "../../../models/user/user.js";
import { getConnectionStatuses } from "../../../utilities/connections.js";
import { getPaginationFromQuery } from "../../../utilities/pagination.js";
import { createResponse } from "../../../utilities/response.js";
import {
  validateData,
  zPaginationSpread,
} from "../../../utilities/validation.js";

const query = z.object(zPaginationSpread);

type Query = z.infer<typeof query>;

export const getLatestReferredUsersValidation = validateData({
  query: query,
});

export async function getLatestReferredUsers(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { page, limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 20,
      maxLimit: 50,
    });

    const [latestReferredUsers, total] = await Promise.all([
      User.find({ referredBy: authUser._id })
        .sort({ createdAt: -1 })
        .select<UserProjectionType["essentials"]>(UserProjection.essentials)
        .skip(skip)
        .limit(limit),
      User.countDocuments({ referredBy: authUser._id }),
    ]);

    const connectionStatuses = await getConnectionStatuses(
      authUser._id,
      latestReferredUsers.map((user) => user._id),
    );

    const results: object[] = [];

    latestReferredUsers.forEach((user) => {
      results.push({
        ...user.toObject(),
        connectionStatus: connectionStatuses[user._id.toString()],
      });
    });

    res.json(
      createResponse(results, {
        totalCount: total,
        page,
        limit,
      }),
    );
  } catch (error) {
    next(error);
  }
}
