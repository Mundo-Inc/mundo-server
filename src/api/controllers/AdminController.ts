import type { NextFunction, Request, Response } from "express";
import { query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";

import User from "../../models/User";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { adminReadUserProjection } from "../dto/user/read-user-admin.dto";
import { type PublicReadUserDto } from "../dto/user/read-user-public.dto";
import { getRemainingXpToNextLevel } from "../services/ranking.service";
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
