import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import {
  type UserProjectionType,
  UserProjection,
} from "../../../api/dto/user.js";
import Follow from "../../../models/follow.js";
import User from "../../../models/user/user.js";
import { getPaginationFromQuery } from "../../../utilities/pagination.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData } from "../../../utilities/validation.js";

const getUsersQuery = z.object({
  q: z
    .string()
    .trim()
    .max(100)
    .transform((value) => decodeURIComponent(value))
    .optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

type GetUsersQuery = z.infer<typeof getUsersQuery>;

export const getUsersValidation = validateData({
  query: getUsersQuery,
});

export async function getUsers(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user;

    const { q } = req.query as GetUsersQuery;

    const { limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 10,
      maxLimit: 50,
    });

    let users: UserProjectionType["essentials"][] = [];

    if (q) {
      users = await User.aggregate([
        {
          $match: {
            source: {
              $exists: false,
            },
            $or: [
              { name: { $regex: q, $options: "i" } },
              { username: { $regex: q, $options: "i" } },
            ],
          },
        },
        {
          $skip: skip,
        },
        {
          $limit: limit,
        },
        {
          $project: UserProjection.essentials,
        },
      ]);
    } else if (authUser) {
      const followings = await Follow.find({ user: authUser._id })
        .populate<{
          target: UserProjectionType["essentials"];
        }>({
          path: "target",
          select: UserProjection.essentials,
        })
        .skip(skip)
        .limit(limit)
        .lean();

      users = followings.map((following) => following.target);
    }

    if (users.length === 0 && authUser) {
      const followers = await Follow.find({ target: authUser._id })
        .populate<{
          user: UserProjectionType["essentials"];
        }>({
          path: "user",
          select: UserProjection.essentials,
        })
        .skip(skip)
        .limit(limit)
        .lean();

      users = followers.map((follower) => follower.user);
    }

    res.status(StatusCodes.OK).json(createResponse(users));
  } catch (err) {
    next(err);
  }
}
