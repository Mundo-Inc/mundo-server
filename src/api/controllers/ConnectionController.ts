import type { NextFunction, Request, Response } from "express";
import { body, param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import Follow from "../../models/Follow";
import FollowRequest, { type IFollowRequest } from "../../models/FollowRequest";
import Notification, { ResourceTypes } from "../../models/Notification";
import User, { type IUser } from "../../models/User";
import UserActivity, {
  ActivityTypeEnum,
  ResourceTypeEnum,
} from "../../models/UserActivity";
import strings from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { publicReadUserEssentialProjection } from "../dto/user/read-user-public.dto";
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
    const { id: authId } = req.user!;
    const isFollowing =
      (await Follow.exists({
        user: authId,
        target: id,
      })) !== null;
    const isFollower =
      (await Follow.exists({
        user: id,
        target: authId,
      })) !== null;
    const isRequestPending =
      (await FollowRequest.exists({
        user: authId,
        target: id,
      })) !== null;
    return res.json({
      success: true,
      data: {
        isFollowing,
        isRequestPending,
        isFollower,
      },
    });
  } catch (error) {
    next(error);
  }
}

export const createUserConnectionValidation: ValidationChain[] = [
  param("id").isMongoId(),
];

async function logFollowingActivity(authId: string, targetId: string) {
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
    const { id: authId } = req.user!;

    // Check if the follow relationship already exists
    const existingFollow = await Follow.findOne({ user: authId, target: id });
    if (existingFollow) {
      logger.debug("You already followed this person");
      throw createError(strings.follows.alreadyExists, StatusCodes.CONFLICT);
    }

    const targetUser = (await User.findById(id)) as IUser;

    if (targetUser.isPrivate) {
      const existingFollowRequest = await FollowRequest.findOne({
        user: authId,
        target: id,
      });

      if (existingFollowRequest) {
        throw createError(
          "You have already sent a follow request",
          StatusCodes.BAD_REQUEST
        );
      }

      await FollowRequest.create({
        user: authId,
        target: id,
      });

      res.status(StatusCodes.NO_CONTENT);

      //TODO: Send Notification to Target that they have a follow request
    } else {
      // Create new follow relationship
      const follow = await Follow.create({ user: authId, target: id });
      // Log new following activity
      await logFollowingActivity(authId, id);
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
    const { id: authId } = req.user!;

    const followRequests = await FollowRequest.find({
      target: authId,
    }).populate("user", publicReadUserEssentialProjection);

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
    const { id: authId } = req.user!;

    const followRequest = (await FollowRequest.findOne({
      _id: id,
      target: authId,
    })) as IFollowRequest;

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
    const { id: authId } = req.user!;

    const deletedDoc = await Follow.findOneAndDelete(
      {
        user: authId,
        target: id,
      },
      {
        includeResultMetadata: false,
      }
    );

    try {
      await UserActivity.findOneAndDelete({
        userId: new mongoose.Types.ObjectId(authId),
        resourceId: new mongoose.Types.ObjectId(id as string),
        activityType: ActivityTypeEnum.FOLLOWING,
        resourceType: ResourceTypeEnum.USER,
      });

      await Notification.findOneAndDelete({
        resources: {
          $elemMatch: { _id: deletedDoc._id, type: ResourceTypes.FOLLOW },
        },
      });
    } catch (e) {
      console.log(`Error deleting "Follow": ${e}`);
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
    const { id: authId } = req.user!;

    const { limit, page } = req.query;
    const limitNumber = parseInt(limit as string) || 50;
    const skipNumber = (parseInt(page as string) - 1) * limitNumber || 0;

    const theUserId = id || authId;

    const userExists = await User.findById(theUserId).lean();
    if (!userExists) {
      throw createError(strings.user.notFound, StatusCodes.NOT_FOUND);
    }

    const data = await Follow.aggregate([
      {
        $match: {
          [type === "followers" ? "target" : "user"]:
            new mongoose.Types.ObjectId(theUserId as string),
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
              $skip: skipNumber,
            },
            {
              $limit: limitNumber,
            },
            {
              $lookup: {
                from: "users",
                localField: type === "followers" ? "user" : "target",
                foreignField: "_id",
                as: "user",
                pipeline: [
                  {
                    $project: publicReadUserEssentialProjection,
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
    });
  } catch (err) {
    next(err);
  }
}

export async function updateUsersPrivacy() {
  try {
    // Find all users who don't have the 'phantomCoins' field
    const usersWithoutPrivacy = await User.find({
      isPrivate: { $exists: false },
    });

    // Iterate over these users and update them
    const updatePromises = usersWithoutPrivacy.map((user) => {
      user.isPrivate = false;
      return user.save(); // Save each updated user
    });

    // Wait for all updates to complete
    await Promise.all(updatePromises);

    logger.verbose("Updated all users missing isPrivate field.");
  } catch (error) {
    console.error("Error updating users: ", error);
  }
}
