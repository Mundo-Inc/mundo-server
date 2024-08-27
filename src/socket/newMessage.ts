import { StatusCodes } from "http-status-codes";
import { Socket } from "socket.io";

import { UserProjectionSchema } from "../api/dto/user.js";
import ChatMessage from "../models/conversation/chatMessage.js";
import Conversation from "../models/conversation/conversation.js";
import { type IUser } from "../models/user/user.js";
import { dStrings, dynamicMessage } from "../strings.js";
import { createError } from "../utilities/errorHandlers.js";
import SocketService from "./index.js";

export default function mountNewMessageEvent(socket: Socket, user: IUser) {
  socket.on(SocketService.CTSEvents.NewMessage, async (data, ack) => {
    const { conversation: conversationId, content } = data;

    const conversation = await Conversation.findById(conversationId).orFail(
      createError(dynamicMessage(dStrings.notFound), StatusCodes.NOT_FOUND),
    );

    if (!conversation.participants.some((p) => p.user.equals(user._id))) {
      throw createError(
        "You are not a participant of this conversation",
        StatusCodes.FORBIDDEN,
      );
    }

    const message = await ChatMessage.create({
      sender: user._id,
      conversation: conversation._id,
      content: content,
    });

    conversation.lastActivity = new Date();

    await conversation.save();

    const response = {
      conversation: conversation._id,
      conetnt: message,
      sender: UserProjectionSchema.essentials.parse(user),
    };

    conversation.participants.forEach((p) => {
      SocketService.emitToUser(
        p.user,
        SocketService.STCEvents.NewMessage,
        response,
      );
    });
  });
}
