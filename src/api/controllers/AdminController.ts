import { ResourceTypes } from "./../../models/Notification";
import type { NextFunction, Request, Response } from "express";
import { body, param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";

import Flag from "../../models/Flag";
import Review from "../../models/Review";
import User from "../../models/User";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { adminReadUserProjection } from "../dto/user/read-user-admin.dto";
import { privateReadUserProjection } from "../dto/user/read-user-private.dto";
import validate from "./validators";
import mongoose from "mongoose";
import Notification from "../../models/Notification";
import Comment from "../../models/Comment";
import UserActivity, { ActivityTypeEnum } from "../../models/UserActivity";
import Reaction from "../../models/Reaction";

export const getUsersValidation: ValidationChain[] = [
  validate.q(query("q").optional()),
  validate.page(query("page").optional()),
  validate.limit(query("limit").optional(), 1, 50),
];
export async function getUsers(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { q } = req.query;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const matchObject: {
      [key: string]: any;
    } = {
      source: { $exists: false },
    };
    if (q) {
      matchObject["$or"] = [
        { name: { $regex: q, $options: "i" } },
        { username: { $regex: q, $options: "i" } },
      ];
    }

    const matchPipeline = [];
    if (Object.keys(matchObject).length !== 0) {
      matchPipeline.push({ $match: matchObject });
    }

    let result = await User.aggregate([
      ...matchPipeline,
      {
        $sort: {
          createdAt: -1,
        },
      },
      {
        $facet: {
          total: [{ $count: "count" }],
          users: [{ $skip: skip }, { $limit: limit }],
        },
      },
      {
        $project: {
          total: { $arrayElemAt: ["$total.count", 0] },
          users: adminReadUserProjection,
        },
      },
    ]);

    const results = result[0];

    if (!results) {
      throw createError("No users found", StatusCodes.NOT_FOUND);
    }

    // const users = results.users.map((user: PublicReadUserDto) => ({
    //   ...user,
    //   remainingXp: getRemainingXpToNextLevel(user.xp || 0),
    // }));

    res
      .status(StatusCodes.OK)
      .json({ success: true, data: results.users, total: results.total });
  } catch (err) {
    next(err);
  }
}

export const getFlagsValidation: ValidationChain[] = [
  validate.q(query("review").optional().isMongoId()),
  validate.page(query("page").optional()),
  validate.limit(query("limit").optional(), 1, 50),
];

export async function getFlags(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { review } = req.query;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    //check if review exists
    if (review) {
      const reviewExists = await Review.exists({ _id: review });
      if (!reviewExists) {
        throw createError("Review not found", StatusCodes.NOT_FOUND);
      }
    }
    // Create a query object to filter the results based on the "review" query parameter if it's set
    const queryObj = review ? { target: review } : {};

    // Query the database to fetch the flags
    const result = await Flag.find(queryObj)
      .sort("-createdAt")
      .skip(skip)
      .limit(limit)
      .populate("target")
      .populate("user", adminReadUserProjection);

    for (const flag of result) {
      switch (flag.targetType) {
        case "Review":
          await flag.populate("target.videos", "src caption type");
          await flag.populate("target.images", "src caption type");
          await flag.populate("target.writer", privateReadUserProjection);
        case "Comment":
          await flag.populate("target.author", privateReadUserProjection);
        default:
          break;
      }
    }

    res.status(StatusCodes.OK).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export const resolveFlagValidation: ValidationChain[] = [
  param("id").isMongoId(),
  body("action").isIn(["DELETE", "IGNORE"]),
  body("note").optional().isString(),
];

export async function resolveFlag(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const { id: userId } = req.user!;
    const { action } = req.body;
    const { id } = req.params;

    const flag = await Flag.findById(id).populate("target");
    if (!flag) {
      throw createError("Flag not found", StatusCodes.NOT_FOUND);
    }

    if (flag.adminAction) {
      throw createError("Flag already resolved", StatusCodes.BAD_REQUEST);
    }

    // do the action

    if (action === "DELETE") {
      if (flag.targetType === "Comment") {
        //remove all notifications that assigned to the comment
        await Notification.deleteMany({
          resources: {
            $elemMatch: {
              type: ResourceTypes.COMMENT,
              _id: flag.target,
            },
          },
        });
      } else if (flag.targetType === "Review") {
        const userActivity = await UserActivity.findOne({
          resourceId: flag.target,
          resourceType: ResourceTypes.REVIEW,
        });

        if (!userActivity) {
          console.error("User activity not found for the given review.");
          return;
        }

        const userActivityId = userActivity._id;

        // Using Promise.all to run the deletions in parallel
        const [relatedComments, relatedReactions] = await Promise.all([
          Comment.find({ userActivity: userActivityId }),
          Reaction.find({ target: userActivityId }),
        ]);

        const relatedCommentsIds = relatedComments.map((c) => c._id);
        const relatedReactionsIds = relatedReactions.map((r) => r._id);

        const allRelatedResourcesIds = [
          ...relatedCommentsIds,
          ...relatedReactionsIds,
        ];

        // Using Promise.all to run the deletions in parallel
        await Promise.all([
          Notification.deleteMany({
            "resources._id": { $in: allRelatedResourcesIds },
          }),
          Reaction.deleteMany({ target: userActivityId }),
          Comment.deleteMany({ userActivity: userActivityId }),
          userActivity.remove(),
          Review.findByIdAndDelete(flag.target),
        ]);

        console.log(
          "Review and related resources have been deleted successfully."
        );
      }
    }

    // save the action
    flag.adminAction = {
      type: action,
      note: req.body.note,
      admin: new mongoose.Types.ObjectId(userId),
      createdAt: new Date(),
    };

    await flag.save();
  } catch (err) {
    next(err);
  }
}
