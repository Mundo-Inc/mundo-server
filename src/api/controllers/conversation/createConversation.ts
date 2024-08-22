import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import ChatMessage from "../../../models/conversation/chatMessage.js";
import Conversation from "../../../models/conversation/conversation.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const body = z.object({
  recipient: zObjectId,
  message: z
    .string()
    .trim()
    .min(1, "Message must be at least 1 character long")
    .max(500, "Message cannot be longer than 500 characters"),
});

type Body = z.infer<typeof body>;

export const createConversationValidation = validateData({
  body: body,
});

export async function createConversation(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { recipient, message } = req.body as Body;

    if (authUser._id.equals(recipient)) {
      throw createError(
        "You cannot send a message to yourself",
        StatusCodes.BAD_REQUEST,
      );
    }

    const conversation = await Conversation.create({
      isGroup: false,
      lastActivity: new Date(),
      participants: [authUser._id, recipient],
    });

    await ChatMessage.create({
      conversation: conversation._id,
      content: message,
      sender: authUser._id,
    });

    res.status(StatusCodes.CREATED).json(createResponse(conversation));
  } catch (err) {
    next(err);
  }
}
