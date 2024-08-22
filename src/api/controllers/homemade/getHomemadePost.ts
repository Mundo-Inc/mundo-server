import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import MediaProjection from "../../../api/dto/media.js";
import { UserProjection } from "../../../api/dto/user.js";
import Homemade from "../../../models/homemade.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const params = z.object({
  id: zObjectId,
});

type Params = z.infer<typeof params>;

export const getHomemadePostValidation = validateData({
  params: params,
});

export async function getHomemadePost(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { id } = req.params as unknown as Params;

    const post = await Homemade.aggregate([
      {
        $match: {
          _id: id,
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "user",
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
        $lookup: {
          from: "media",
          localField: "media",
          foreignField: "_id",
          as: "media",
          pipeline: [
            {
              $project: MediaProjection.brief,
            },
          ],
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "tags",
          foreignField: "_id",
          as: "tags",
          pipeline: [
            {
              $project: UserProjection.essentials,
            },
          ],
        },
      },
      {
        $lookup: {
          from: "reactions",
          let: {
            userActivityId: "$userActivityId",
          },
          as: "reactions",
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$target", "$$userActivityId"] },
              },
            },
            {
              $facet: {
                total: [
                  {
                    $group: {
                      _id: "$reaction",
                      count: { $sum: 1 },
                      type: { $first: "$type" },
                    },
                  },
                  {
                    $project: {
                      _id: 0,
                      reaction: "$_id",
                      type: 1,
                      count: 1,
                    },
                  },
                ],
                user: [
                  {
                    $match: {
                      user: authUser._id,
                    },
                  },
                  {
                    $project: {
                      _id: 1,
                      type: 1,
                      reaction: 1,
                      createdAt: 1,
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      {
        $project: {
          _id: 1,
          createdAt: 1,
          updatedAt: 1,
          content: 1,
          user: { $arrayElemAt: ["$user", 0] },
          media: 1,
          tags: 1,
          reactions: { $arrayElemAt: ["$reactions", 0] },
        },
      },
    ]).then((res) => res[0]);

    if (!post) {
      throw createError(
        dynamicMessage(ds.notFound, "Post"),
        StatusCodes.NOT_FOUND,
      );
    }

    res.status(StatusCodes.OK).json(createResponse(post));
  } catch (err) {
    next(err);
  }
}
