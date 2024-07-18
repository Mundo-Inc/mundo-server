import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import type { FilterQuery } from "mongoose";
import { z } from "zod";

import type {
  NotificationItemByToken,
  NotificationItemByUser,
} from "@/api/services/NotificationsService.js";
import NotificationsService from "@/api/services/NotificationsService.js";
import type { IUser } from "@/models/User.js";
import User from "@/models/User.js";
import { validateData, zObjectId } from "@/utilities/validation.js";

const body = z.object({
  audience: z.enum(["all", "referredBy", "list"]),
  audienceValue: zObjectId.or(z.array(zObjectId)),
  note: z.object({
    title: z.string(),
    body: z.string(),
    subtitle: z.string().optional(),
  }),
  sendConfirm: z.boolean().optional(),
});

type Body = z.infer<typeof body>;

export const notifyUsersValidation = validateData({
  body: body,
});

export async function notifyUsers(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const {
      audience,
      audienceValue,
      note: inputNote,
      sendConfirm,
    } = req.body as Body;

    const query: FilterQuery<IUser> = {
      source: { $exists: false },
    };

    if (audience === "referredBy") {
      query["referredBy"] = audienceValue;
    } else if (audience === "list") {
      query["_id"] = { $in: audienceValue };
    }

    const users = await User.find(query)
      .select<Pick<IUser, "devices">>("devices")
      .lean();

    const ADMINS = ["645c8b222134643c020860a5", "645e7f843abeb74ee6248ced"];

    if (sendConfirm) {
      const adminItems: NotificationItemByUser[] = ADMINS.map((id) => ({
        message: {
          notification: {
            title: inputNote.title,
            body: inputNote.body,
          },
          data: {
            link: "inbox/notifications",
          },
        },
        user: id,
      }));

      await NotificationsService.getInstance().sendNotificationsByUser(
        adminItems
      );

      const items: NotificationItemByToken[] = [];

      for (const user of users) {
        if (user.devices.length > 0) {
          items.push(
            ...user.devices
              .filter((d) => d.fcmToken)
              .map((d) => ({
                tokenMessage: {
                  notification: {
                    title: inputNote.title,
                    body: inputNote.body,
                  },
                  data: {
                    link: "inbox/notifications",
                  },
                  token: d.fcmToken!,
                },
                user: user._id,
              }))
          );
        }
      }

      const responses =
        await NotificationsService.getInstance().sendNotificationsByToken(
          items
        );

      res.status(StatusCodes.OK).json({
        success: true,
        data: {
          sentDevices: responses ? responses.successCount : 0,
          failedDevices: responses ? responses.failureCount : 0,
          total: `${users.length} recepients + ${ADMINS.length} admins`,
        },
      });
    } else {
      res.status(StatusCodes.OK).json({
        success: true,
        data: {
          total: `${users.length} recepients + ${ADMINS.length} admins`,
          haveDevices: users.filter((u) => u.devices.length > 0).length,
          admins: ADMINS.length,
        },
      });
    }
  } catch (error) {
    next(error);
  }
}
