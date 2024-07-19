import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import type { PipelineStage } from "mongoose";
import { z } from "zod";

import Notification from "@/models/Notification.js";
import { getPaginationFromQuery } from "@/utilities/pagination.js";
import {
  validateData,
  zPaginationSpread,
  zStringInt,
} from "@/utilities/validation.js";
import { getNotificationContent } from "./helpers.js";

const query = z.object({
  ...zPaginationSpread,
  unread: z
    .string()
    .transform((value) => value === "true")
    .optional()
    .default("false"),
});

type Query = z.infer<typeof query>;

export const getNotificationsValidation = validateData({
  query: query,
});

export async function getNotifications(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = req.user!;

    const { unread } = req.query as unknown as Query;

    const { page, limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 20,
      maxLimit: 50,
    });

    const matchPipeline: PipelineStage[] = [
      {
        $match: {
          user: authUser._id,
        },
      },
    ];

    if (unread) {
      matchPipeline.push({
        $match: {
          readAt: null,
        },
      });
    }

    const result = await Notification.aggregate([
      ...matchPipeline,
      {
        $facet: {
          notifications: [
            {
              $sort: {
                createdAt: -1,
              },
            },
            {
              $skip: skip,
            },
            {
              $limit: limit,
            },
          ],
          total: [
            {
              $count: "total",
            },
          ],
        },
      },
      {
        $unwind: "$total",
      },
      {
        $project: {
          notifications: 1,
          total: "$total.total",
        },
      },
    ]).then((result) => result[0]);

    if (result && result.notifications.length > 0) {
      for (const notification of result.notifications) {
        const { user, title, content, image, activity } =
          await getNotificationContent(notification);

        if (user) {
          notification.user = user;
        } else {
          delete notification.user;
        }
        if (content) {
          notification.content = content;
        }
        if (title) {
          notification.title = title;
        }
        if (image) {
          notification.image = image;
        }
        if (activity) {
          notification.activity = activity;
        }
      }

      result.notifications = result.notifications.filter(
        (n: { content?: string; title?: string }) =>
          (n.content && n.content.length > 0) || (n.title && n.title.length > 0)
      );
    }

    res.status(StatusCodes.OK).json({
      success: true,
      data: result?.notifications || [],
      pagination: {
        totalCount: result ? result.total : 0,
        page: page,
        limit: limit,
      },
    });
  } catch (err) {
    next(err);
  }
}
