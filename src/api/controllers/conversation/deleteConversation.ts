import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import Conversation from "../../../models/conversation/conversation.js";
import ConversationMessage from "../../../models/conversation/conversationMessage.js";
import SocketService from "../../../socket/index.js";
import { dStrings, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const params = z.object({
  conversationId: zObjectId,
});

export const deleteConversationValidation = validateData({
  params: params,
});

type Params = z.infer<typeof params>;

export async function deleteConversation(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { conversationId } = req.params as unknown as Params;

    const conversation = await Conversation.findById(conversationId).orFail(
      createError(
        dynamicMessage(dStrings.notFound, "Conversation"),
        StatusCodes.NOT_FOUND,
      ),
    );

    if (conversation.isGroup) {
      throw createError(
        "Cannot delete a group conversation",
        StatusCodes.BAD_REQUEST,
      );
    }

    const isParticipant = conversation.participants.some((p) =>
      p.user.equals(authUser._id),
    );

    if (!isParticipant) {
      throw createError(
        "You are not a participant of this conversation",
        StatusCodes.FORBIDDEN,
      );
    }

    await ConversationMessage.deleteMany({ conversation: conversationId });
    await conversation.deleteOne();

    res.sendStatus(StatusCodes.NO_CONTENT);

    conversation.participants.forEach((p) => {
      SocketService.emitToUser(
        p.user,
        SocketService.STCEvents.DeleteConversation,
        conversation._id,
      );
    });
  } catch (err) {
    next(err);
  }
}
