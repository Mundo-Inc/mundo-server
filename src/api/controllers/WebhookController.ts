import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import twilio from "twilio";

import Conversation from "../../models/Conversation";
import User, { type IUser } from "../../models/User";
import { dStrings, dynamicMessage } from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import logger from "../services/logger";
import { NotificationsService } from "../services/NotificationsService";

const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN!;
const twilioWebhookURL = process.env.TWILIO_WEBHOOK_URL!;

export async function conversationsWebhook(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const twilioSignature = req.headers["x-twilio-signature"] as string;

    if (!twilioSignature) {
      throw createError(
        "Access denied. Missing Twilio signature.",
        StatusCodes.UNAUTHORIZED
      );
    }

    if (
      !twilio.validateRequest(
        twilioAuthToken,
        twilioSignature,
        twilioWebhookURL,
        req.body
      )
    ) {
      throw createError(
        "Access denied. Invalid Twilio signature.",
        StatusCodes.UNAUTHORIZED
      );
    }

    const { EventType, Body, Author, ParticipantSid, ConversationSid } =
      req.body;

    switch (EventType) {
      case "onMessageAdded":
        logger.verbose("onMessageAdded event received");

        const conversation = await Conversation.findById(ConversationSid)
          .orFail(
            createError(
              dynamicMessage(dStrings.notFound, "Conversation"),
              StatusCodes.NOT_FOUND
            )
          )
          .lean();

        const authorInfo = await User.findById(Author)
          .orFail(
            createError(
              dynamicMessage(dStrings.notFound, "Author"),
              StatusCodes.NOT_FOUND
            )
          )
          .select<Pick<IUser, "name">>("name")
          .lean();

        const usersToNotify = conversation.participants.filter(
          (c) => c.chat !== ParticipantSid && c.user.toString() !== Author
        );

        logger.verbose(`Notifying ${usersToNotify.length} users.`);

        NotificationsService.getInstance().sendNotificationsByUser(
          usersToNotify.map((u) => ({
            message: {
              notification: {
                title: authorInfo.name,
                body: Body || "New message",
              },
              data: {
                link: `chat/${ConversationSid}`,
                contextId: `chat/${ConversationSid}`,
              },
              apns: {
                payload: {
                  aps: {
                    "mutable-content": 1,
                    sound: "default",
                  },
                },
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
