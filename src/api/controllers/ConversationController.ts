import type { NextFunction, Request, Response } from "express";
import { query, body, param, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import User from "../../models/User";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { publicReadUserEssentialProjection } from "../dto/user/read-user-public.dto";

import twilio from "twilio";
const AccessToken = twilio.jwt.AccessToken;
const ChatGrant = AccessToken.ChatGrant;

export const getTokenValidation: ValidationChain[] = [];
export async function getToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { content, activity } = req.body;
    const { id: authId } = req.user!;

    const chatGrant = new ChatGrant({
      serviceSid: process.env.TWILIO_SERVICE_SID,
    });

    // Creating token
    const token = new AccessToken(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_API_KEY!,
      process.env.TWILIO_API_SECRET!,
      {
        identity: authId,
      }
    );
    token.addGrant(chatGrant);

    res.json({ success: true, data: { token: token.toJwt() } });

    res.status(StatusCodes.CREATED).json({ success: true, data: {} });
  } catch (err) {
    next(err);
  }
}
