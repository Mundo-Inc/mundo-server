import type { NextFunction, Request, Response } from "express";
import { query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";

import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import validate from "./validators";
import CheckIn from "../../models/CheckIn";
import mongoose from "mongoose";
import { checkinEarning } from "../services/earning.service";
import { addCheckinActivity } from "../services/user.activity.service";
import { ActivityPrivacyTypeEnum } from "../../models/UserActivity";
import { addCreateCheckinXP } from "../services/ranking.service";
import User from "../../models/User";
import { getUserFeed } from "../services/feed.service";
import Notification from "../../models/Notification";

export const getNotificationsValidation: ValidationChain[] = [
  validate.page(query("page").optional()),
  validate.limit(query("limit").optional(), 10, 50),
  query("unread").optional().isBoolean(),
];
export async function getNotifications(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: authId } = req.user!;

    const { unread } = req.query;
    const limit = Number(req.query.limit) || 10;
    const page = Number(req.query.page) || 1;
    const skip = (page - 1) * limit;

    const matchPipeline: any[] = [
      {
        $match: {
          user: new mongoose.Types.ObjectId(authId),
        },
      },
    ];
    if (unread) {
      matchPipeline.push({
        $match: {
          read: null,
        },
      });
    }

    const notifications = await Notification.aggregate([
      ...matchPipeline,
      {
        $sort: {
          createdAt: -1,
        },
      },
      {
        $facet: {
          notifications: [
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
    ]);

    res.status(StatusCodes.OK).json({
      success: true,
      data: notifications[0],
      hasMore: notifications[0].total > page * limit,
    });
  } catch (err) {
    next(err);
  }
}
