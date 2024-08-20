import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { Types } from "mongoose";
import { z } from "zod";

import type { UserProjectionEssentials } from "../../../api/dto/user.js";
import UserProjection from "../../../api/dto/user.js";
import Follow, { FollowStatusEnum } from "../../../models/follow.js";
import type { IFollowRequest } from "../../../models/followRequest.js";
import FollowRequest from "../../../models/followRequest.js";
import type { ConnectionStatus } from "../../../utilities/connections.js";
import { getPaginationFromQuery } from "../../../utilities/pagination.js";
import { createResponse } from "../../../utilities/response.js";
import {
  validateData,
  zPaginationSpread,
} from "../../../utilities/validation.js";

const query = z.object(zPaginationSpread);

export const getFollowRequestsValidation = validateData({
  query: query,
});

export async function getFollowRequests(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { page, limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 50,
      maxLimit: 100,
    });

    const [userFollowRequests, totalCount] = await Promise.all([
      FollowRequest.find({
        target: authUser._id,
      })
        .sort({ _id: -1 })
        .skip(skip)
        .limit(limit)
        .select<Pick<IFollowRequest, "_id" | "user" | "createdAt">>({
          user: 1,
          createdAt: 1,
        })
        .populate<{
          user: UserProjectionEssentials & {
            connectionStatus: ConnectionStatus | null;
          };
        }>("user", UserProjection.essentials)
        .lean(),
      FollowRequest.countDocuments({
        target: authUser._id,
      }),
    ]);

    const followRequests = await FollowRequest.find({
      user: authUser._id,
      target: {
        $in: userFollowRequests.map((f) => f.user._id),
      },
    }).lean();

    // Get follow status for each user
    const usersObject: Record<string, ConnectionStatus> = {};

    userFollowRequests.forEach((f) => {
      const userId: string = f.user._id.toString();
      if (userId in usersObject) {
        usersObject[userId].followedByStatus = FollowStatusEnum.Requested;
      } else {
        usersObject[userId] = {
          followedByUser: false,
          followsUser: false,
          followingStatus: FollowStatusEnum.NotFollowing,
          followedByStatus: FollowStatusEnum.Requested,
        };
      }
    });

    followRequests.forEach((f) => {
      const targetId: string = f.target.toString();
      if (targetId in usersObject) {
        usersObject[targetId].followingStatus = FollowStatusEnum.Requested;
      } else {
        usersObject[targetId] = {
          followedByUser: false,
          followsUser: false,
          followingStatus: FollowStatusEnum.Requested,
          followedByStatus: FollowStatusEnum.NotFollowing,
        };
      }
    });

    const usersObjectKeys = Object.keys(usersObject).map(
      (key) => new Types.ObjectId(key),
    );
    const followItems = await Follow.find({
      $or: [
        {
          user: authUser._id,
          target: usersObjectKeys,
        },
        {
          target: authUser._id,
          user: usersObjectKeys,
        },
      ],
    })
      .select({
        target: 1,
        user: 1,
      })
      .lean();

    followItems.forEach((f) => {
      const userId = f.user.toString();
      const targetId = f.target.toString();
      if (authUser._id.equals(userId)) {
        usersObject[targetId].followedByUser = true;
        usersObject[targetId].followingStatus = FollowStatusEnum.Following;
      } else {
        usersObject[userId].followsUser = true;
        usersObject[userId].followedByStatus = FollowStatusEnum.Following;
      }
    });

    userFollowRequests.forEach((f) => {
      f.user.connectionStatus = usersObject[f.user._id.toString()];
    });

    res.status(StatusCodes.OK).json(
      createResponse(userFollowRequests, {
        totalCount,
        page,
        limit,
      }),
    );
  } catch (error) {
    next(error);
  }
}
