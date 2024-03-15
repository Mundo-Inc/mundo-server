import apn from "@parse/node-apn";
import type { NextFunction, Request, Response } from "express";
import { body, query, type ValidationChain } from "express-validator";

import { StatusCodes } from "http-status-codes";
import apnProvider from "../../config/apn";
import User, { type UserDevice } from "../../models/User";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import logger from "../services/logger";

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
  query("confirmSend").optional().isBoolean({ strict: true }),
];
export async function notifyUsers(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    if (!apnProvider) {
      throw createError(
        "APN provider not available",
        StatusCodes.INTERNAL_SERVER_ERROR
      );
    }

    const { audience, audienceValue, note: inputNote, toAll } = req.body;

    const query: any = {
      source: { $exists: false },
    };

    if (audience === "referredBy") {
      query["referredBy"] = audienceValue;
    } else if (audience === "list") {
      query["_id"] = { $in: audienceValue };
    }

    const users = await User.find(query, ["name", "devices"]).lean();

    const admins = await User.find(
      {
        _id: { $in: ["645c8b222134643c020860a5", "645e7f843abeb74ee6248ced"] },
      },
      ["name", "devices"]
    ).lean();

    if (req.query.confirmSend) {
      let sent = 0;
      let failed = 0;

      try {
        // Sending to admins
        for (const user of admins) {
          if (user.devices.length > 0) {
            // Notify user
            logger.verbose(`Notifying admin ${user.name} | ${user.id}`);

            const note = new apn.Notification({
              alert: {
                title: inputNote.title,
                body: inputNote.body,
                subtitle: inputNote.subtitle,
              },
              badge: 1,
              sound: "default",
              topic: "ai.phantomphood.app",
              payload: {
                link: "notifications",
              },
              priority: 5,
            });

            await apnProvider
              .send(
                note,
                user.devices
                  .filter((d: UserDevice) => d.apnToken)
                  .map((d: UserDevice) => d.apnToken)
              )
              .then((result) => {
                if (result.sent.length > 0) {
                  logger.verbose(
                    `Notification sent to ${user.name} | ${user.id}`
                  );
                } else {
                  logger.verbose(
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
            logger.verbose(`User ${user.name} | ${user.id} has no devices.`);
          }
        }
      } catch (error) {
        logger.error("Internal server error while sending APN notification", {
          error,
        });
      }

      try {
        // Sending to users
        for (const user of users) {
          if (user.devices.length > 0) {
            // Notify user
            logger.verbose(`Notifying user ${user.name} | ${user.id}`);

            const note = new apn.Notification({
              alert: {
                title: inputNote.title,
                body: inputNote.body,
                subtitle: inputNote.subtitle,
              },
              badge: 1,
              sound: "default",
              topic: "ai.phantomphood.app",
              payload: {
                link: "notifications",
              },
              priority: 5,
            });

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
                  logger.verbose(
                    `Notification sent to ${user.name} | ${user.id}`
                  );
                } else {
                  failed++;
                  logger.verbose(
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
            logger.verbose(`User ${user.name} | ${user.id} has no devices.`);
          }
        }
      } catch (error) {
        logger.error("Internal server error while sending APN notification", {
          error,
        });
      }

      res.status(StatusCodes.OK).json({
        success: true,
        data: {
          sent,
          failed,
          total: users.length,
          admins: admins.length,
        },
      });
    } else {
      res.status(StatusCodes.OK).json({
        success: true,
        data: {
          total: users.length,
          admins: admins.length,
          haveDevices: users.filter((u) => u.devices.length > 0).length,
        },
      });
    }
  } catch (error) {
    next(error);
  }
}
