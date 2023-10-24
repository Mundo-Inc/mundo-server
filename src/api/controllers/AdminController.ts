import type { NextFunction, Request, Response } from "express";
import { query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";

import Flag from "../../models/Flag";
import Review from "../../models/Review";
import User from "../../models/User";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { adminReadUserProjection } from "../dto/user/read-user-admin.dto";
import { privateReadUserProjection } from "../dto/user/read-user-private.dto";
import validate from "./validators";

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
