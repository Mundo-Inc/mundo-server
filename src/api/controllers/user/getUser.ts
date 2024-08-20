import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { Types } from "mongoose";
import { z } from "zod";

import UserProjection from "../../../api/dto/user.js";
import { calcRemainingXP } from "../../../api/services/reward/helpers/levelCalculations.js";
import { getLevelThresholds } from "../../../api/services/reward/utils/levelupThresholds.js";
import Block from "../../../models/Block.js";
import CheckIn from "../../../models/CheckIn.js";
import Follow, { FollowStatusEnum } from "../../../models/Follow.js";
import Review from "../../../models/Review.js";
import User from "../../../models/user/user.js";
import strings, { dStrings as ds, dynamicMessage } from "../../../strings.js";
import {
  getConnectionStatus,
  type ConnectionStatus,
} from "../../../utilities/connections.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData } from "../../../utilities/validation.js";

const getUserParams = z.object({
  id: z.string(),
});

const getUserQuery = z.object({
  idType: z.enum(["oid", "uid"]).optional(),
  view: z.enum(["basic", "contextual"]).optional().default("contextual"),
});

type GetUserParams = z.infer<typeof getUserParams>;
type GetUserQuery = z.infer<typeof getUserQuery>;

export const getUserValidation = validateData({
  params: getUserParams,
  query: getUserQuery,
});

export async function getUser(req: Request, res: Response, next: NextFunction) {
  try {
    const authUser = req.user;

    const { id } = req.params as GetUserParams;
    const { idType, view } = req.query as GetUserQuery;

    let oid: Types.ObjectId;
    if (idType === "uid") {
      // if id type is uid -> get user by uid
      const user = await User.findOne({ uid: id })
        .orFail(
          createError(
            dynamicMessage(ds.notFound, "User"),
            StatusCodes.NOT_FOUND,
          ),
        )
        .lean();

      oid = user._id;
    } else if (id === "me") {
      if (!authUser) {
        throw createError(
          strings.authorization.loginRequired,
          StatusCodes.UNAUTHORIZED,
        );
      }

      oid = authUser._id;
    } else if (id.startsWith("@")) {
      // if id starts with @ -> get user by username
      const user = await User.findOne({
        username: {
          $regex: `^${id.slice(1)}$`,
          $options: "i",
        },
      })
        .orFail(
          createError(
            dynamicMessage(ds.notFound, "User"),
            StatusCodes.NOT_FOUND,
          ),
        )
        .lean();

      oid = user._id;
    } else {
      oid = new Types.ObjectId(id);
    }

    let user: any;
    let connectionStatus: ConnectionStatus = {
      followedByUser: false,
      followsUser: false,
      followingStatus: FollowStatusEnum.NotFollowing,
      followedByStatus: FollowStatusEnum.NotFollowing,
    };

    if (authUser && authUser._id.equals(oid)) {
      // own profile

      user = await User.findById(oid, UserProjection.private)
        .orFail(
          createError(
            dynamicMessage(ds.notFound, "User"),
            StatusCodes.NOT_FOUND,
          ),
        )
        .populate({
          path: "progress.achievements",
          select: "type createdAt",
        })
        .lean();

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
    } else if (authUser && view === "contextual") {
      // contextual view

      const isBlocked = await Block.findOne({
        $or: [
          { user: oid, target: authUser._id },
          { user: authUser._id, target: oid },
        ],
      });

      if (isBlocked) {
        if (authUser._id.equals(isBlocked.user)) {
          throw createError(
            strings.blocks.user.isBlocked,
            StatusCodes.FORBIDDEN,
          );
        } else {
          throw createError(
            strings.blocks.user.hasBlocked,
            StatusCodes.FORBIDDEN,
          );
        }
      }

      user = await User.findById(oid, UserProjection.public)
        .orFail(
          createError(
            dynamicMessage(ds.notFound, "User"),
            StatusCodes.NOT_FOUND,
          ),
        )
        .populate({
          path: "progress.achievements",
          select: "type createdAt",
        })
        .lean();

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

      connectionStatus = await getConnectionStatus(authUser._id, oid);
    } else if (view === "basic") {
      // basic view

      user = await User.findById(oid, UserProjection.public)
        .orFail(
          createError(
            dynamicMessage(ds.notFound, "User"),
            StatusCodes.NOT_FOUND,
          ),
        )
        .populate({
          path: "progress.achievements",
          select: "type createdAt",
        })
        .lean();

      const achievements: any = {};
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
        user.progress.achievements = Object.values(achievements);
      }
    } else {
      throw createError(
        strings.authorization.loginRequired,
        StatusCodes.FORBIDDEN,
      );
    }

    const [rank, followersCount, followingCount, reviewsCount, totalCheckIns] =
      await Promise.all([
        User.countDocuments({
          source: { $exists: false },
          "progress.xp": { $gt: user.progress.xp },
        }).sort({ createdAt: -1 }),
        Follow.countDocuments({ target: oid }),
        Follow.countDocuments({ user: oid }),
        Review.countDocuments({ writer: oid }),
        CheckIn.countDocuments({ user: oid }),
      ]);

    let prevLevelXp = 0;
    if (user.progress.level > 1) {
      prevLevelXp = getLevelThresholds()[user.progress.level];
    }

    const result: any = {
      ...user,
      followersCount,
      followingCount,
      reviewsCount,
      totalCheckins: totalCheckIns,
      rank: rank + 1,
      remainingXp: calcRemainingXP((user.progress && user.progress.xp) || 0),
      prevLevelXp: prevLevelXp,
    };

    if (view === "contextual") {
      result.connectionStatus = connectionStatus;
    }

    res.status(StatusCodes.OK).json(createResponse(result));
  } catch (err) {
    next(err);
  }
}
