import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import { UserProjection } from "../../../api/dto/user.js";
import Media from "../../../models/media.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { getPaginationFromQuery } from "../../../utilities/pagination.js";
import { createResponse } from "../../../utilities/response.js";
import {
  validateData,
  zObjectId,
  zPaginationSpread,
} from "../../../utilities/validation.js";

const params = z.object({
  placeId: zObjectId,
});
const query = z.object({
  ...zPaginationSpread,
  type: z.enum(["image", "video"]).optional(),
  priority: z.enum(["image", "video"]).optional(),
});

type Params = z.infer<typeof params>;
type Query = z.infer<typeof query>;

export const getPlaceMediaValidation = validateData({
  params: params,
  query: query,
});

export async function getPlaceMedia(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { placeId } = req.params as unknown as Params;
    const { type, priority } = req.query as unknown as Query;

    const { page, limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 20,
      maxLimit: 50,
    });

    if (priority) {
      if (type) {
        throw createError(
          "Cannot specify both type and priority",
          StatusCodes.BAD_REQUEST,
        );
      }
    }

    const media = await Media.aggregate([
      {
        $match: {
          place: placeId,
          ...(type ? { type } : {}),
        },
      },
      {
        $sort: {
          createdAt: -1,
          ...(priority ? { type: priority === "image" ? 1 : -1 } : {}),
        },
      },
      {
        $facet: {
          total: [
            {
              $count: "count",
            },
          ],
          media: [
            {
              $skip: skip,
            },
            {
              $limit: limit,
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
              $project: {
                _id: 1,
                src: 1,
                caption: 1,
                type: 1,
                user: { $arrayElemAt: ["$user", 0] },
              },
            },
          ],
        },
      },
    ]).then((result) => result[0]);

    res.status(StatusCodes.OK).json(
      createResponse(media.media || [], {
        totalCount: media.total[0]?.count || 0,
        page,
        limit,
      }),
    );
  } catch (err) {
    next(err);
  }
}
