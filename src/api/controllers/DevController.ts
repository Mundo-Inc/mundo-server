import apn from "@parse/node-apn";
import type { NextFunction, Request, Response } from "express";
import { body, query, type ValidationChain } from "express-validator";

import { StatusCodes } from "http-status-codes";
import apnProvider from "../../config/apn";
import User, { type UserDevice } from "../../models/User";
import { handleInputErrors } from "../../utilities/errorHandlers";
import logger from "../services/logger";

export const notifyUsersValidation: ValidationChain[] = [
  body("referredBy").optional().isMongoId(),
  body("users").optional().isArray().isMongoId(),
  body("note").isObject(),
  body("note.title").isString(),
  body("note.body").isString(),
  body("note.subtitle").optional().isString(),
  query("confirmSend").optional().isBoolean(),
];
export async function notifyUsers(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { referredBy, users: usersList, note: inputNote } = req.body;

    const query: any = {};
    if (referredBy) {
      query["referredBy"] = referredBy;
    } else if (usersList) {
      query["_id"] = { $in: usersList };
    }

    const users = await User.find(query, ["name", "devices"]).lean();

    if (req.query.confirmSend) {
      let sent = 0;
      let failed = 0;

      for (const user of users) {
        if (user.devices.length > 0) {
          // Notify user
          logger.info(`Notifying user ${user.name} | ${user.id}`);

          const note = new apn.Notification();
          note.alert = {
            title: inputNote.title,
            body: inputNote.body,
            subtitle: inputNote.subtitle,
          };
          note.priority = 5;

          note.topic = "ai.phantomphood.app";
          note.sound = "default";

          await apnProvider
            .send(
              note,
              user.devices
                .filter((d: UserDevice) => d.apnToken)
                .map((d: UserDevice) => d.apnToken)
            )
            .then((result) => {
              if (result.sent.length > 0) {
                sent++;
                logger.info(`Notification sent to ${user.name} | ${user.id}`);
              } else {
                failed++;
                logger.error(
                  `Notification failed to send to ${user.name} | ${user.id}`
                );
              }
            })
            .catch((err) => {
              logger.error(
                "Internal server error while sending APN notification",
                {
                  error: err,
                }
              );
            });
        } else {
          logger.error(`User ${user.name} | ${user.id} has no devices.`);
        }
      }

      res.status(StatusCodes.OK).json({
        success: true,
        data: {
          sent,
          failed,
          total: users.length,
        },
      });
    } else {
      return res.status(StatusCodes.OK).json({
        success: true,
        data: {
          total: users.length,
          haveDevices: users.filter((u) => u.devices.length > 0).length,
        },
      });
    }
  } catch (error) {
    next(error);
  }
}
