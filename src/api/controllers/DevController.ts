import apn from "@parse/node-apn";
import type { NextFunction, Request, Response } from "express";

import apnProvider from "../../config/apn";
import { handleInputErrors } from "../../utilities/errorHandlers";
import User, { type UserDevice } from "../../models/User";
import logger from "../services/logger";
import { StatusCodes } from "http-status-codes";

export async function notifyUsers(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const users = ["645c8b222134643c020860a5", "645e7f843abeb74ee6248ced"];

    let sent = 0;
    let failed = 0;

    for (const userId of users) {
      const user = await User.findById(userId, ["name", "devices"]);

      if (user.devices.length > 0) {
        // Notify user
        logger.info(`Notifying user ${user.name} | ${user.id}`);

        const note = new apn.Notification();
        note.alert = {
          title: "Test Title",
          body: "Test Body",
          subtitle: "Test Subtitle",
        };
        note.priority = 5;

        note.topic = "ai.phantomphood.app";
        note.badge = 1;
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
      },
    });
  } catch (error) {
    next(error);
  }
}
