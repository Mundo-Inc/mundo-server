import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import type { PipelineStage } from "mongoose";
import { z } from "zod";

import MediaProjection from "../../../api/dto/media.js";
import PlaceProjection from "../../../api/dto/place.js";
import UserProjection from "../../../api/dto/user.js";
import CheckIn from "../../../models/CheckIn.js";
import Follow from "../../../models/Follow.js";
import User from "../../../models/User.js";
import { ResourcePrivacyEnum } from "../../../models/UserActivity.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { fakeObjectIdString } from "../../../utilities/generator.js";
import { getPaginationFromQuery } from "../../../utilities/pagination.js";
import { createResponse } from "../../../utilities/response.js";
import {
  validateData,
  zObjectId,
  zPaginationSpread,
} from "../../../utilities/validation.js";

const query = z.object({
  ...zPaginationSpread,
  user: zObjectId.optional(),
  place: zObjectId.optional(),
  event: zObjectId.optional(),
  count: z
    .string()
    .transform((value) => value === "true")
    .optional(),
});

type Query = z.infer<typeof query>;

export const getCheckInsValidation = validateData({
  query: query,
});

export async function getCheckIns(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { user, place, event } = req.query as Query;

    const { page, limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 500,
      maxLimit: 500,
    });

    const matchPipeline: PipelineStage[] = [];

    const privacyPipeline: PipelineStage[] = [
      {
        $lookup: {
          from: "follows",
          localField: "user",
          foreignField: "target",
          as: "followDetails",
        },
      },
      {
        $addFields: {
          isFollowed: {
            $anyElementTrue: {
              $map: {
                input: "$followDetails",
                as: "followDetail",
                in: {
                  $eq: ["$$followDetail.user", authUser._id],
                },
              },
            },
          },
        },
      },
      {
        $match: {
          $or: [
            { privacyType: "PUBLIC" },
            {
              privacyType: "PRIVATE",
              user: authUser._id,
            },
            { privacyType: "FOLLOWING", isFollowed: true },
          ],
        },
      },
    ];

    if (user) {
      //PRIVACY
      const userObject = await User.findById(user).orFail(
        createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND),
      );

      if (!user.equals(authUser._id) && userObject.isPrivate) {
        await Follow.exists({
          user: authUser._id,
          target: userObject._id,
        }).orFail(
          createError(
            "You are not allowed to view this user's check-ins",
            StatusCodes.FORBIDDEN,
          ),
        );
      }

      matchPipeline.push({
        $match: { user: user },
      });
    }
    if (place) {
      // TODO: Add privacy check here
      matchPipeline.push({
        $match: { place: place },
      });
    }
    if (event) {
      matchPipeline.push({
        $match: { event: event },
      });
    }

    const result = await CheckIn.aggregate([
      ...matchPipeline,
      ...privacyPipeline,
      {
        $facet: {
          count: [
            {
              $count: "count",
            },
          ],
          checkIns: [
            {
              $sort: { createdAt: -1 },
            },
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
              $lookup: {
                from: "places",
                localField: "place",
                foreignField: "_id",
                as: "place",
                pipeline: [
                  {
                    $project: {
                      ...PlaceProjection.brief,
                      location: PlaceProjection.locationProjection,
                    },
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
              $project: {
                _id: 1,
                caption: 1,
                tags: 1,
                privacyType: 1,
                createdAt: 1,
                updatedAt: 1,
                media: 1,
                user: { $arrayElemAt: ["$user", 0] },
                place: { $arrayElemAt: ["$place", 0] },
              },
            },
          ],
        },
      },
      {
        $project: {
          count: { $arrayElemAt: ["$count.count", 0] },
          checkIns: 1,
        },
      },
    ]).then((result) => result[0]);

    // TODO: Remove this temporary migration fix
    for (const checkIn of result.checkIns) {
      checkIn.image = checkIn.media?.[0];
    }

    if (!user || !user.equals(authUser._id)) {
      // anonymize user data
      for (const checkIn of result.checkIns) {
        if (
          checkIn.privacyType === ResourcePrivacyEnum.Private &&
          !authUser._id.equals(checkIn.user._id)
        ) {
          checkIn._id = fakeObjectIdString();
          checkIn.user._id = fakeObjectIdString();
          checkIn.user.name = "Anonymous";
          checkIn.user.username = "Anonymous";
          checkIn.user.profileImage = null;
          checkIn.user.progress = {
            xp: Math.round(Math.random() * checkIn.user.progress?.xp ?? 100),
            level: Math.round(
              Math.random() * checkIn.user.progress?.level ?? 10,
            ),
          };
        }
      }
    }

    res.status(StatusCodes.OK).json(
      createResponse(result.checkIns, {
        totalCount: result.total || 0,
        page: page,
        limit: limit,
      }),
    );
  } catch (err) {
    next(err);
  }
}
