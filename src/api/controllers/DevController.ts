import type { NextFunction, Request, Response } from "express";
import { body, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";

import User, { type UserDevice } from "../../models/User";
import { handleInputErrors } from "../../utilities/errorHandlers";
import {
  NotificationsService,
  type NotificationItemByToken,
  type NotificationItemByUser,
} from "../services/notifications.service";

export const notifyUsersValidation: ValidationChain[] = [
  body("audience").isString().isIn(["all", "referredBy", "list"]),
  body("audienceValue")
    .exists()
    .withMessage("Audience value is required")
    .bail()
    .custom((value, { req }) => {
      if (!value) {
        throw Error("Audience value is required");
      }

      if (req.body.audience === "referredBy") {
        if (typeof value !== "string") {
          throw Error("audienceValue must be a string");
        }
        return value.match(/^[0-9a-fA-F]{24}$/);
      } else if (req.body.audience === "list") {
        if (!Array.isArray(value)) {
          throw Error("audienceValue must be an array");
        }
        return value.every((id: string) => id.match(/^[0-9a-fA-F]{24}$/));
      }

      return true;
    }),
  body("note").isObject(),
  body("note.title").isString(),
  body("note.body").isString(),
  body("note.subtitle").optional().isString(),
  body("sendConfirm").optional().isBoolean(),
];
export async function notifyUsers(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { audience, audienceValue, note: inputNote, sendConfirm } = req.body;

    const query: any = {
      source: { $exists: false },
    };

    if (audience === "referredBy") {
      query["referredBy"] = audienceValue;
    } else if (audience === "list") {
      query["_id"] = { $in: audienceValue };
    }

    const users = await User.find(query, ["devices"]).lean();

    // const ADMINS = ["645c8b222134643c020860a5", "645e7f843abeb74ee6248ced"];
    const ADMINS = ["645c8b222134643c020860a5"];

    if (sendConfirm) {
      const adminItems: NotificationItemByUser[] = ADMINS.map((id) => ({
        message: {
          notification: {
            title: inputNote.title,
            body: inputNote.body,
          },
          data: {
            link: "notifications",
          },
        },
        user: id,
      }));

      await NotificationsService.getInstance().sendNotificationsByUser(
        adminItems
      );

      const items: NotificationItemByToken[] = [];

      for (const user of users) {
        if (user.devices && user.devices.length > 0) {
          items.push(
            ...user.devices
              .filter((d: UserDevice) => d.fcmToken)
              .map((d: UserDevice) => ({
                tokenMessage: {
                  notification: {
                    title: inputNote.title,
                    body: inputNote.body,
                  },
                  data: {
                    link: "notifications",
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
