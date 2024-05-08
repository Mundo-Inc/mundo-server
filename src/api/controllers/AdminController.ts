import type { NextFunction, Request, Response } from "express";
import { body, param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import { Types } from "mongoose";

import AppSetting from "../../models/AppSetting";
import CheckIn from "../../models/CheckIn";
import Comment from "../../models/Comment";
import Flag from "../../models/Flag";
import Homemade from "../../models/Homemade";
import Review from "../../models/Review";
import User from "../../models/User";
import { dStrings as ds, dynamicMessage } from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import validate from "./validators";
import UserProjection from "../dto/user/user";

export const getUsersValidation: ValidationChain[] = [
  query("signupMethod").optional(),
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

    const { q, signupMethod } = req.query;
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
    if (signupMethod) {
      matchObject["signupMethod"] = signupMethod;
    }
    const matchPipeline = [];
    if (Object.keys(matchObject).length !== 0) {
      matchPipeline.push({ $match: matchObject });
    }

    const result = await User.aggregate([
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
          users: UserProjection.admin,
        },
      },
    ]);

    const results = result[0];

    if (!results) {
      throw createError(
        dynamicMessage(ds.notFound, "User"),
        StatusCodes.NOT_FOUND
      );
    }

    res.status(StatusCodes.OK).json({
      success: true,
      data: results.users,
      pagination: {
        totalCount: results.total,
        page,
        limit,
      },
    });
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
    const queryObj = review
      ? {
          target: new Types.ObjectId(review as string),
          adminAction: { $exists: false },
        }
      : { adminAction: { $exists: false } };

    const [totalDocuments, result] = await Promise.all([
      Flag.countDocuments(queryObj),
      Flag.find(queryObj)
        .sort("-createdAt")
        .skip(skip)
        .limit(limit)
        .populate("target")
        .populate("user", UserProjection.admin),
    ]);

    for (const flag of result) {
      switch (flag.targetType) {
        case "Review":
          await Promise.all([
            flag.populate("target.writer", UserProjection.private),
            flag.populate("target.images", "_id src caption type"),
            flag.populate("target.videos", "_id src caption type"),
          ]);
        case "Comment":
          await flag.populate("target.author", UserProjection.private);
        case "CheckIn":
          await flag.populate("target.user", UserProjection.private);
        case "Homemade":
          await flag.populate("target.user", UserProjection.private);
        default:
          break;
      }
    }

    res.status(StatusCodes.OK).json({
      success: true,
      data: result,
      total: totalDocuments,
      pagination: {
        totalCount: totalDocuments,
        page,
        limit,
      },
    });
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
    const authUser = req.user!;
    const { action } = req.body;
    const { id } = req.params;

    const flag = await Flag.findById(id).populate("target");
    if (!flag) {
      throw createError(
        dynamicMessage(ds.notFound, "Flag"),
        StatusCodes.NOT_FOUND
      );
    }

    if (flag.adminAction) {
      throw createError("Flag already resolved", StatusCodes.BAD_REQUEST);
    }

    if (action === "DELETE") {
      if (flag.targetType === "Comment") {
        const comment = await Comment.findById(flag.target);
        if (comment) await comment.deleteOne();
      } else if (flag.targetType === "Review") {
        const review = await Review.findById(flag.target);
        if (review) await review.deleteOne();
      } else if (flag.targetType === "CheckIn") {
        const checkIn = await CheckIn.findById(flag.target);
        if (checkIn) await checkIn.deleteOne();
      } else if (flag.targetType === "Homemade") {
        const homemade = await Homemade.findById(flag.target);
        if (homemade) await homemade.deleteOne();
      }
    }

    const adminAction = {
      type: action,
      note: req.body.note,
      admin: authUser._id,
      createdAt: new Date(),
    };

    // save the action
    flag.adminAction = adminAction;

    await flag.save();

    // If the flagaction was delete we need to resolve all the flags for that target.
    if (action === "DELETE") {
      const relatedFlags = await Flag.find({
        targetType: flag.targetType,
        target: flag.target,
      });
      for (const f of relatedFlags) {
        f.adminAction = adminAction;
        await f.save();
      }
    }

    res.status(StatusCodes.OK).json({ success: true, data: flag });
  } catch (err) {
    next(err);
  }
}

export async function getSettings(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const settings = await AppSetting.find({}).lean();

    const data: { [key: string]: any } = {};

    for (const setting of settings) {
      data[setting.key] = setting.value;
    }

    res.status(StatusCodes.OK).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export const updateSettingsValidation: ValidationChain[] = [
  body("key")
    .isString()
    .notEmpty()
    .isIn(["latestAppVersion", "minOperationalVersion"]),
  body("value").isString().notEmpty(),
];
export async function updateSettings(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { key, value } = req.body;

    const setting = await AppSetting.findOneAndUpdate(
      { key },
      { value },
      { new: true }
    );

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}
