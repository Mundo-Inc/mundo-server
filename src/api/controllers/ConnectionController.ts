import type { NextFunction, Request, Response } from "express";
import { body, param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import Follow from "../../models/Follow";
import FollowRequest, { type IFollowRequest } from "../../models/FollowRequest";
import Notification, { ResourceTypeEnum } from "../../models/Notification";
import User, { type IUser } from "../../models/User";
import UserActivity, {
  ActivityResourceTypeEnum,
  ActivityTypeEnum,
} from "../../models/UserActivity";
import strings, { dStrings, dynamicMessage } from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import UserProjection from "../dto/user/user";
import logger from "../services/logger";
import { addNewFollowingActivity } from "../services/user.activity.service";
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

    const [followedByUser, followsUser] = await Promise.all([
      Follow.exists({ user: authUser._id, target: id }),
      Follow.exists({ user: id, target: authUser._id }),
    ]);

    const isRequestPending =
      (await FollowRequest.exists({ user: authUser._id, target: id })) !== null;

    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        followedByUser: !!followedByUser,
        followsUser: !!followsUser,
        isRequestPending,

        // TODO: Remove this after the client is updated
        isFollowing: !!followedByUser,
        isFollower: !!followsUser,
      },
    });
  } catch (error) {
    next(error);
  }
}

export const createUserConnectionValidation: ValidationChain[] = [
  param("id").isMongoId(),
];

async function logFollowingActivity(
  authId: mongoose.Types.ObjectId,
  targetId: string
) {
  try {
    await addNewFollowingActivity(authId, targetId);
  } catch (e) {
    logger.error(
      "Something happened during creation of activity for the following",
      { error: e }
    );
    throw e;
  }
}

export async function createUserConnection(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id } = req.params;
    const authUser = req.user!;

    // Check if the follow relationship already exists
    const existingFollow = await Follow.findOne({
      user: authUser._id,
      target: id,
    });
    if (existingFollow) {
      logger.debug("You already followed this person");
      throw createError(strings.follows.alreadyExists, StatusCodes.CONFLICT);
    }

    const targetUser: IUser | null = await User.findById(id);

    if (!targetUser) {
      throw createError(
        dynamicMessage(dStrings.notFound, "User"),
        StatusCodes.NOT_FOUND
      );
    }

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

      await FollowRequest.create({
        user: authUser._id,
        target: id,
      });

      res.status(StatusCodes.NO_CONTENT);

      //TODO: Send Notification to Target that they have a follow request
    } else {
      // Create new follow relationship
      const follow = await Follow.create({ user: authUser._id, target: id });
      // Log new following activity
      await logFollowingActivity(authUser._id, id);
      res.status(StatusCodes.CREATED).json({ success: true, data: follow });
    }
  } catch (err) {
    next(err); // Pass any errors to the error handling middleware
  }
}

export const getPendingConnectionsValidation: ValidationChain[] = [];

export async function getPendingConnections(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const authUser = req.user!;

    const followRequests = await FollowRequest.find({
      target: authUser._id,
    }).populate("user", UserProjection.essentials);

    res
      .status(StatusCodes.CREATED)
      .json({ success: true, data: followRequests });
  } catch (error) {
    next(error);
  }
}

export const acceptConnectionRequestValidation: ValidationChain[] = [
  body("id").isMongoId(),
];

export async function acceptConnectionRequest(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const { id } = req.body;
    const authUser = req.user!;

    const followRequest: IFollowRequest | null = await FollowRequest.findOne({
      _id: id,
      target: authUser._id,
    });

    if (!followRequest) {
      throw createError(strings.followRequest.notFound, StatusCodes.NOT_FOUND);
    }

    const follow = await Follow.create({
      user: followRequest.user,
      target: followRequest.target,
    });

    await followRequest.deleteOne();
    //TODO: Send notification to follow.user that your follow request got accepted
    res.status(StatusCodes.CREATED).json({ success: true, data: follow });
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
      throw createError(strings.user.notFound, StatusCodes.NOT_FOUND);
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
