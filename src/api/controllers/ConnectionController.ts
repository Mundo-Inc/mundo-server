import { NextFunction, Request, Response } from "express";
import { ValidationChain, param, query } from "express-validator";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import Follow from "../../models/Follow";
import { publicReadUserProjection } from "../dto/user/read-user-public.dto";
import mongoose from "mongoose";
import User from "../../models/User";
import validate from "./validators";
import { StatusCodes } from "http-status-codes";
import Notification, { ResourceTypes } from "../../models/Notification";
import UserActivity, {
  ActivityTypeEnum,
  ResourceTypeEnum,
} from "../../models/UserActivity";
import { addNewFollowingActivity } from "../services/user.activity.service";
import strings from "../../strings";

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
    return res.json({
      sucsess: true,
      data: {
        isFollowing,
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
export async function createUserConnection(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id } = req.params;
    const { id: authId } = req.user!;

    let follow = await Follow.findOne({ user: authId, target: id });
    if (follow) {
      throw createError(strings.follows.alreadyExists, StatusCodes.CONFLICT);
    }
    follow = await Follow.create({
      user: authId,
      target: id,
    });
    try {
      const _act = await addNewFollowingActivity(authId, id as string);
      if (_act) {
      }
    } catch (e) {
      console.log(`Something happened during create following: ${e}`);
    }
    res.status(StatusCodes.CREATED).json({ success: true, data: follow });
  } catch (err) {
    next(err);
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
      throw createError(strings.user.notFound, 404);
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
                    $lookup: {
                      from: "achievements",
                      localField: "progress.achievements",
                      foreignField: "_id",
                      as: "progress.achievements",
                    },
                  },
                ],
              },
            },
            {
              $unwind: "$user",
            },
            {
              $project: {
                user: publicReadUserProjection,
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

    res.status(200).json({
      success: true,
      data: data[0]?.connections || [],
      total: data[0]?.total || 0,
    });
  } catch (err) {
    next(err);
  }
}
