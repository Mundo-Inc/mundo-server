import type { NextFunction, Request, Response } from "express";
import { body, param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import Follow, { FollowStatusEnum } from "../../models/Follow";
import FollowRequest from "../../models/FollowRequest";
import Notification, { ResourceTypeEnum } from "../../models/Notification";
import User from "../../models/User";
import UserActivity, {
  ActivityResourceTypeEnum,
  ActivityTypeEnum,
} from "../../models/UserActivity";
import { dStrings, dynamicMessage } from "../../strings";
import {
  getConnectionStatus,
  type ConnectionStatus,
} from "../../utilities/connections";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import UserProjection, { type UserProjectionEssentials } from "../dto/user";
import { UserActivityManager } from "../services/UserActivityManager";
import logger from "../services/logger";
import validate from "./validators";

export const connectionFollowStatusValidation: ValidationChain[] = [
  param("id").isMongoId(),
];

export async function connectionFollowStatus(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id } = req.params;
    const authUser = req.user!;

    const connectionStatus = await getConnectionStatus(authUser._id, id);

    return res.status(StatusCodes.OK).json({
      success: true,
      data: connectionStatus,
    });
  } catch (error) {
    next(error);
  }
}

export const createUserConnectionValidation: ValidationChain[] = [
  param("id").isMongoId(),
];

export async function createUserConnection(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const id = new mongoose.Types.ObjectId(req.params.id);

    // Check if the follow relationship already exists
    const existingFollow = await Follow.exists({
      user: authUser._id,
      target: id,
    });
    if (existingFollow) {
      logger.debug("You already followed this person");
      throw createError(
        dynamicMessage(dStrings.alreadyExists, "Follow"),
        StatusCodes.CONFLICT
      );
    }

    const targetUser = await User.findById(id).orFail(
      createError(
        dynamicMessage(dStrings.notFound, "User"),
        StatusCodes.NOT_FOUND
      )
    );

    if (targetUser.isPrivate) {
      const existingFollowRequest = await FollowRequest.findOne({
        user: authUser._id,
        target: id,
      });

      if (existingFollowRequest) {
        throw createError(
          "You have already sent a follow request",
          StatusCodes.BAD_REQUEST
        );
      }

      const request = await FollowRequest.create({
        user: authUser._id,
        target: id,
      });

      res.status(StatusCodes.ACCEPTED).json({
        success: true,
        data: request,
      });

      //TODO: Send Notification to Target that they have a follow request
    } else {
      // Create new follow relationship
      const follow = await Follow.create({
        user: authUser._id,
        target: id,
      });

      // Create following activity
      await UserActivityManager.createFollowActivity(authUser, id);

      res.status(StatusCodes.CREATED).json({ success: true, data: follow });
    }
  } catch (err) {
    next(err); // Pass any errors to the error handling middleware
  }
}

export const getFollowRequestsValidation: ValidationChain[] = [
  validate.page(query("page").optional()),
  validate.limit(query("limit").optional(), 10, 50),
];

export async function getFollowRequests(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const limit = parseInt(req.query.limit as string) || 50;
    const page = parseInt(req.query.page as string) || 1;
    const skip = (page - 1) * limit;

    const [userFollowRequests, followRequests] = await Promise.all([
      FollowRequest.find({
        target: authUser._id,
      })
        .sort({ _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate<{
          user: UserProjectionEssentials & {
            connectionStatus: ConnectionStatus | null;
          };
        }>("user", UserProjection.essentials)
        .lean(),
      FollowRequest.find({
        user: authUser._id,
      }).lean(),
    ]);

    // Get follow status for each user
    const usersObject: Record<string, ConnectionStatus> = {};

    userFollowRequests.forEach((f) => {
      const userId: string = f.user._id.toString();
      if (userId in usersObject) {
        usersObject[userId].followedByStatus = FollowStatusEnum.REQUESTED;
      } else {
        usersObject[userId] = {
          followedByUser: false,
          followsUser: false,
          followingStatus: FollowStatusEnum.NOT_FOLLOWING,
          followedByStatus: FollowStatusEnum.REQUESTED,
        };
      }
    });

    followRequests.forEach((f) => {
      const targetId: string = f.target.toString();
      if (targetId in usersObject) {
        usersObject[targetId].followingStatus = FollowStatusEnum.REQUESTED;
      } else {
        usersObject[targetId] = {
          followedByUser: false,
          followsUser: false,
          followingStatus: FollowStatusEnum.REQUESTED,
          followedByStatus: FollowStatusEnum.NOT_FOLLOWING,
        };
      }
    });

    const usersObjectKeys = Object.keys(usersObject).map(
      (key) => new mongoose.Types.ObjectId(key)
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
        usersObject[targetId].followingStatus = FollowStatusEnum.FOLLOWING;
      } else {
        usersObject[userId].followsUser = true;
        usersObject[userId].followedByStatus = FollowStatusEnum.FOLLOWING;
      }
    });

    userFollowRequests.forEach((f) => {
      f.user.connectionStatus = usersObject[f.user._id.toString()];
    });

    res
      .status(StatusCodes.OK)
      .json({ success: true, data: userFollowRequests });
  } catch (error) {
    next(error);
  }
}

export const acceptFollowRequestValidation: ValidationChain[] = [
  body("id").isMongoId(),
];

export async function acceptFollowRequest(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id } = req.body;
    const authUser = req.user!;

    const followRequest = await FollowRequest.findOne({
      _id: id,
      target: authUser._id,
    }).orFail(
      createError(
        dynamicMessage(dStrings.notFound, "Follow Request"),
        StatusCodes.NOT_FOUND
      )
    );

    const follow = await Follow.create({
      user: followRequest.user,
      target: followRequest.target,
    });

    await Promise.all([
      UserActivityManager.createFollowActivity(authUser, followRequest.target),
      followRequest.deleteOne(),
    ]);

    //TODO: Send notification to follow.user that your follow request got accepted
    res.status(StatusCodes.CREATED).json({ success: true, data: follow });
  } catch (error) {
    next(error);
  }
}

export const rejectFollowRequestValidation: ValidationChain[] = [
  body("id").isMongoId(),
];

export async function rejectFollowRequest(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id } = req.body;
    const authUser = req.user!;

    const followRequest = await FollowRequest.findOne({
      _id: id,
      target: authUser._id,
    }).orFail(
      createError(
        dynamicMessage(dStrings.notFound, "Follow Request"),
        StatusCodes.NOT_FOUND
      )
    );

    await followRequest.deleteOne();

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (error) {
    next(error);
  }
}

export const deleteUserConnectionValidation: ValidationChain[] = [
  param("id").isMongoId(),
];
export async function deleteUserConnection(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id } = req.params;
    const authUser = req.user!;

    const deletedDoc = await Follow.findOneAndDelete(
      {
        user: authUser._id,
        target: id,
      },
      {
        includeResultMetadata: false,
      }
    );

    try {
      await UserActivity.deleteOne({
        userId: authUser._id,
        resourceId: new mongoose.Types.ObjectId(id as string),
        activityType: ActivityTypeEnum.FOLLOWING,
        resourceType: ActivityResourceTypeEnum.USER,
      });
    } catch (e) {
      logger.error("Error while deleting user connection", { error: e });
    }

    if (deletedDoc) {
      try {
        await Notification.deleteOne({
          resources: {
            $elemMatch: { _id: deletedDoc._id, type: ResourceTypeEnum.FOLLOW },
          },
        });
      } catch (e) {
        logger.error(
          "Error while deleting notification after deleting user connection",
          { error: e }
        );
      }
    }

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}

export const getUserConnectionsValidation: ValidationChain[] = [
  param("id").isMongoId(),
  param("type").isIn(["followers", "followings"]),
  validate.page(query("page").optional(), 100),
  validate.limit(query("limit").optional(), 1, 50),
];
export async function getUserConnections(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id, type } = req.params;
    const authUser = req.user!;

    const { limit: reqLimit, page: reqPage } = req.query;
    const limit = parseInt(reqLimit as string) || 50;
    const page = parseInt(reqPage as string) || 1;
    const skip = (page - 1) * limit;

    const theUserId = id ? new mongoose.Types.ObjectId(id) : authUser._id;

    const userExists = await User.findById(theUserId).lean();
    if (!userExists) {
      throw createError(
        dynamicMessage(dStrings.notFound, "User"),
        StatusCodes.NOT_FOUND
      );
    }

    const data = await Follow.aggregate([
      {
        $match: {
          [type === "followers" ? "target" : "user"]: theUserId,
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
    ]);

    res.status(StatusCodes.OK).json({
      success: true,
      data: data[0]?.connections || [],
      total: data[0]?.total || 0,
      pagination: {
        totalCount: data[0]?.total || 0,
        page: page,
        limit: limit,
      },
    });
  } catch (err) {
    next(err);
  }
}
