import type { NextFunction, Request, Response } from "express";
import { type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";

import Conversation, { type IConversation } from "../../models/Conversation";
import User, { type IUser } from "../../models/User";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import logger from "../services/logger";
import { NotificationsService } from "../services/notifications.service";
import { dStrings, dynamicMessage } from "../../strings";

export const conversationsWebhookValidator: ValidationChain[] = [];
export async function conversationsWebhook(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { EventType, Body, Author, ParticipantSid, ConversationSid } =
      req.body;

    switch (EventType) {
      case "onMessageAdded":
        logger.verbose("onMessageAdded event received");

        const conversation: IConversation | null = await Conversation.findById(
          ConversationSid
        ).lean();

        if (!conversation) {
          logger.warn(`Conversation ${ConversationSid} not found.`);
          throw createError(
            dynamicMessage(dStrings.notFound, "Conversation"),
            StatusCodes.NOT_FOUND
          );
        }

        const authorInfo: IUser | null = await User.findById(
          Author,
          "name"
        ).lean();

        if (!authorInfo) {
          logger.warn(`User ${Author} not found. Skipping notification.`);
          throw createError(
            dynamicMessage(dStrings.notFound, "Author"),
            StatusCodes.NOT_FOUND
          );
        }

        const usersToNotify = conversation.participants.filter(
          (c) => c.chat !== ParticipantSid && c.user.toString() !== Author
        );

        logger.verbose(`Notifying ${usersToNotify.length} users.`);

        NotificationsService.getInstance().sendNotificationsByUser(
          usersToNotify.map((u) => ({
            message: {
              notification: {
                title: authorInfo.name,
                body: Body,
              },
              data: {
                link: `/chat/${ConversationSid}`,
              },
            },
            user: u.user,
          }))
        );

        break;
      default:
        logger.warn(`Unhandled event type: ${EventType}`);
        break;
    }

    res.sendStatus(StatusCodes.OK);
  } catch (err) {
    next(err);
  }
}
