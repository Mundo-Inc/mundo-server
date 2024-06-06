import type { NextFunction, Request, Response } from "express";
import { param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import { ResourceTypeEnum } from "../../models/Enum/ResourceTypeEnum.js";
import Follow, { FollowStatusEnum } from "../../models/Follow.js";
import FollowRequest, {
  type IFollowRequest,
} from "../../models/FollowRequest.js";
import Notification, {
  NotificationTypeEnum,
} from "../../models/Notification.js";
import User, { type IUser } from "../../models/User.js";
import UserActivity, { ActivityTypeEnum } from "../../models/UserActivity.js";
import { dStrings, dynamicMessage } from "../../strings.js";
import {
  getConnectionStatus,
  type ConnectionStatus,
} from "../../utilities/connections.js";
import {
  createError,
  handleInputErrors,
} from "../../utilities/errorHandlers.js";
import { getPaginationFromQuery } from "../../utilities/pagination.js";
import UserProjection, { type UserProjectionEssentials } from "../dto/user.js";
import { UserActivityManager } from "../services/UserActivityManager.js";
import logger from "../services/logger/index.js";
import validate from "./validators.js";

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

    const authUser = req.user!;

    const id = new mongoose.Types.ObjectId(req.params.id);

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
      const existingFollowRequest = await FollowRequest.exists({
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
  validate.limit(query("limit").optional(), 10, 100),
];

export async function getFollowRequests(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const { limit, skip } = getPaginationFromQuery(req, {
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
        usersObject[targetId].followingStatus = FollowStatusEnum.Following;
      } else {
        usersObject[userId].followsUser = true;
        usersObject[userId].followedByStatus = FollowStatusEnum.Following;
      }
    });

    userFollowRequests.forEach((f) => {
      f.user.connectionStatus = usersObject[f.user._id.toString()];
    });

    res.status(StatusCodes.OK).json({
      success: true,
      data: userFollowRequests,
      pagination: {
        totalCount,
        page: 1,
        limit,
      },
    });
  } catch (error) {
    next(error);
  }
}

export const acceptFollowRequestValidation: ValidationChain[] = [
  param("requestId").isMongoId(),
];

export async function acceptFollowRequest(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const id = new mongoose.Types.ObjectId(req.params.requestId);

    const followRequest = await FollowRequest.findOne({
      _id: id,
      target: authUser._id,
    })
      .orFail(
        createError(
          dynamicMessage(dStrings.notFound, "Follow Request"),
          StatusCodes.NOT_FOUND
        )
      )
      .populate<{
        user: Pick<IUser, "_id" | "isPrivate">;
      }>({
        path: "user",
        select: ["_id", "isPrivate"],
      });

    const follow = await Follow.create({
      user: followRequest.user,
      target: followRequest.target,
    });

    await Promise.all([
      UserActivityManager.createFollowActivity(
        followRequest.user,
        followRequest.target
      ),
      followRequest.deleteOne(),
    ]);

    await Notification.create({
      user: followRequest.user._id,
      type: NotificationTypeEnum.FollowRequestAccepted,
      resources: [
        {
          _id: follow._id,
          type: ResourceTypeEnum.Follow,
          date: follow.createdAt,
        },
      ],
      importance: 2,
    });

    res.status(StatusCodes.CREATED).json({ success: true, data: follow });
  } catch (error) {
    next(error);
  }
}

export const rejectFollowRequestValidation: ValidationChain[] = [
  param("requestId").isMongoId(),
];

export async function rejectFollowRequest(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const id = new mongoose.Types.ObjectId(req.params.requestId as string);

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

    const authUser = req.user!;

    const id = new mongoose.Types.ObjectId(req.params.id);

    const followDoc = await Follow.findOne({
      user: authUser._id,
      target: id,
    });

    if (followDoc) {
      const [deleteFollow, deleteUserActivity, deleteNotification] =
        await Promise.all([
          followDoc.deleteOne(),
          UserActivity.deleteOne({
            userId: authUser._id,
            resourceId: id,
            activityType: ActivityTypeEnum.Following,
            resourceType: ResourceTypeEnum.User,
          }),
          Notification.deleteOne({
            resources: {
              $elemMatch: { _id: followDoc._id, type: ResourceTypeEnum.Follow },
            },
          }),
        ]);

      if (!deleteFollow.deletedCount) {
        logger.error("Error while deleting user connection", {
          error: "Follow not found",
        });
      }

      if (!deleteUserActivity.deletedCount) {
        logger.error("Error while deleting user connection", {
          error: "UserActivity not found",
        });
      }

      if (!deleteNotification.deletedCount) {
        logger.error(
          "Error while deleting notification after deleting user connection",
          { error: "Notification not found" }
        );
      }
    } else {
      const requestDoc = await FollowRequest.findOne({
        user: authUser._id,
        target: id,
      }).orFail(
        createError(
          dynamicMessage(dStrings.notFound, "Entity"),
          StatusCodes.NOT_FOUND
        )
      );

      const [deleteRequest, deleteNotification] = await Promise.all([
        requestDoc.deleteOne(),
        Notification.deleteOne({
          resources: {
            $elemMatch: {
              _id: requestDoc._id,
              type: ResourceTypeEnum.FollowRequest,
            },
          },
        }),
      ]);

      if (!deleteRequest.deletedCount) {
        logger.error("Error while deleting user connection", {
          error: "FollowRequest not found",
        });
      }

      if (!deleteNotification.deletedCount) {
        logger.error(
          "Error while deleting notification after deleting user connection",
          { error: "Notification not found" }
        );
      }
    }

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}

export const removeFollowerValidation: ValidationChain[] = [
  param("userId").isMongoId(),
];
export async function removeFollower(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const userId = new mongoose.Types.ObjectId(req.params.userId);

    const followDoc = await Follow.findOne({
      user: userId,
      target: authUser._id,
    }).orFail(
      createError(
        dynamicMessage(dStrings.notFound, "Connection"),
        StatusCodes.NOT_FOUND
      )
    );

    await followDoc.deleteOne();

    const [deleteUserActivity, deleteNotification] = await Promise.all([
      UserActivity.deleteOne({
        userId: userId,
        resourceId: authUser._id,
        activityType: ActivityTypeEnum.Following,
        resourceType: ResourceTypeEnum.User,
      }),
      Notification.deleteOne({
        resources: {
          $elemMatch: { _id: followDoc._id, type: ResourceTypeEnum.Follow },
        },
      }),
    ]);

    if (!deleteUserActivity.deletedCount) {
      logger.error("Error while deleting user connection", {
        error: "UserActivity not found",
      });
    }

    if (!deleteNotification.deletedCount) {
      logger.error(
        "Error while deleting notification after deleting user connection",
        { error: "Notification not found" }
      );
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

    const authUser = req.user!;

    const id = new mongoose.Types.ObjectId(req.params.id);
    const type = req.params.type as "followers" | "followings";

    const { page, limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 50,
      maxLimit: 100,
    });

    const theUserId = id ? new mongoose.Types.ObjectId(id) : authUser._id;

    await User.exists(theUserId).orFail(
      createError(
        dynamicMessage(dStrings.notFound, "User"),
        StatusCodes.NOT_FOUND
      )
    );

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
