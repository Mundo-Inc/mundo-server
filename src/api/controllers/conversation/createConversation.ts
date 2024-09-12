import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import Conversation from "../../../models/conversation/conversation.js";
import ConversationMessage from "../../../models/conversation/conversationMessage.js";
import User from "../../../models/user/user.js";
import SocketService from "../../../socket/index.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";
import {
  UserProjection,
  UserProjectionSchema,
  UserProjectionType,
} from "../../dto/user.js";
import NotificationsService from "../../services/notificationsService.js";

const body = z.object({
  recipient: zObjectId,
  content: z
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

    const { recipient, content } = req.body as Body;

    if (authUser._id.equals(recipient)) {
      throw createError(
        "You cannot send a message to yourself",
        StatusCodes.BAD_REQUEST,
      );
    }

    const exists = await Conversation.exists({
      $and: [
        { participants: { $elemMatch: { user: authUser._id } } },
        { participants: { $elemMatch: { user: recipient } } },
      ],
      isGroup: false,
    });

    if (exists) {
      throw createError("Conversation already exists", StatusCodes.CONFLICT);
    }

    const conversation = await Conversation.create({
      isGroup: false,
      lastMessageIndex: 0,
      lastActivity: new Date(),
      participants: [
        { user: authUser._id, read: { index: 0, date: new Date() } },
        { user: recipient },
      ],
    });

    const covnersationMessage = await ConversationMessage.create({
      conversation: conversation._id,
      content: content,
      sender: authUser._id,
      index: 0,
    });

    const users = await User.find({
      _id: {
        $in: conversation.participants.map((p) => p.user),
      },
    })
      .select<UserProjectionType["essentials"]>(UserProjection.essentials)
      .lean();

    const usersMap = new Map<string, UserProjectionType["essentials"]>();

    for (const user of users) {
      usersMap.set(user._id.toString(), user);
    }

    const conversationObj = conversation.toObject();
    const participants = conversationObj.participants.map((p) => ({
      ...p,
      user: usersMap.get(p.user.toString()),
    }));

    res.status(StatusCodes.CREATED).json(
      createResponse({
        ...conversationObj,
        participants,
      }),
    );

    const response = {
      ...covnersationMessage.toObject(),
      sender: UserProjectionSchema.essentials.parse(authUser),
      conversation: {
        ...conversationObj,
        participants,
      },
    };

    conversation.participants.forEach((p) => {
      SocketService.emitToUser(
        p.user,
        SocketService.STCEvents.NewMessage,
        response,
      );
    });

    NotificationsService.getInstance().sendNotificationsByUser(
      Array.from(usersMap.values())
        .filter((p) => !p._id.equals(authUser._id))
        .map((p) => ({
          user: p._id,
          message: {
            notification: {
              title: `${authUser.name} sent you a message`,
              body:
                content.length > 30 ? content.slice(0, 27) + "..." : content,
            },
            data: {
              link: `conversation/${conversation._id}`,
            },
          },
        })),
    );
  } catch (err) {
    next(err);
  }
}
