import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import UserProjection from "../../../api/dto/user.js";
import User from "../../../models/User.js";
import { getConnectionStatuses } from "../../../utilities/connections.js";
import { getPaginationFromQuery } from "../../../utilities/pagination.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData } from "../../../utilities/validation.js";

const getLeaderboardQuery = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
});

export const getLeaderboardValidation = validateData({
  query: getLeaderboardQuery,
});

export async function getLeaderboard(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 30,
      maxLimit: 50,
    });

    const leaderboard = await User.aggregate([
      { $match: { source: { $ne: "yelp" } } },
      {
        $sort: {
          "progress.xp": -1,
          createdAt: -1,
        },
      },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "achievements",
          localField: "progress.achievements",
          foreignField: "_id",
          as: "progress.achievements",
        },
      },
      {
        $project: UserProjection.public,
      },
    ]);

    const usersObject = await getConnectionStatuses(
      authUser._id,
      leaderboard.map((u) => u._id),
    );

    for (const user of leaderboard) {
      const achievements: Record<string, any> = {};
      for (const achievement of user.progress.achievements) {
        if (achievement.type in achievements) {
          achievements[achievement.type].createdAt = achievement.createdAt;
          achievements[achievement.type].count++;
        } else {
          achievements[achievement.type] = {
            _id: achievement.type,
            type: achievement.type,
            createdAt: achievement.createdAt,
            count: 1,
          };
        }
      }
      user.progress.achievements = Object.values(achievements);
      user.connectionStatus = usersObject[user._id.toString()];
    }

    res.status(StatusCodes.OK).json(createResponse(leaderboard));
  } catch (err) {
    next(err);
  }
}
