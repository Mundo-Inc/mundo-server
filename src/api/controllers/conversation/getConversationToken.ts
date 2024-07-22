import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import twilio from "twilio";

import { env } from "../../../env.js";
import { createResponse } from "../../../utilities/response.js";

export async function getConversationToken(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const AccessToken = twilio.jwt.AccessToken;

    // Creating token
    const token = new AccessToken(
      env.TWILIO_ACCOUNT_SID,
      env.TWILIO_API_KEY_SID,
      env.TWILIO_API_KEY_SECRET,
      {
        identity: authUser._id.toString(),
      },
    );

    const chatGrant = new AccessToken.ChatGrant({
      serviceSid: env.TWILIO_SERVICE_SID,
    });

    token.addGrant(chatGrant);

    res.status(StatusCodes.OK).json(
      createResponse({
        token: token.toJwt(),
      }),
    );
  } catch (err) {
    next(err);
  }
}
