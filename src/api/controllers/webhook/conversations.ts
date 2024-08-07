import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import twilio from "twilio";

import logger from "../../../api/services/logger/index.js";
import { env } from "../../../env.js";
import { createError } from "../../../utilities/errorHandlers.js";

export async function conversationsWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const twilioSignature = req.headers["x-twilio-signature"] as string;

    if (!twilioSignature) {
      throw createError(
        "Access denied. Missing Twilio signature.",
        StatusCodes.UNAUTHORIZED,
      );
    }

    if (
      !twilio.validateRequest(
        env.TWILIO_AUTH_TOKEN,
        twilioSignature,
        env.TWILIO_WEBHOOK_URL,
        req.body,
      )
    ) {
      throw createError(
        "Access denied. Invalid Twilio signature.",
        StatusCodes.UNAUTHORIZED,
      );
    }

    const { EventType, Body, Author, ParticipantSid, ConversationSid } =
      req.body;

    switch (EventType) {
      case "onMessageAdded":
        logger.verbose("onMessageAdded event received");
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
