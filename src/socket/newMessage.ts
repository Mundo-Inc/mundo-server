import { StatusCodes } from "http-status-codes";
import { Socket } from "socket.io";

import { UserProjectionSchema } from "../api/dto/user.js";
import NotificationsService from "../api/services/notificationsService.js";
import Conversation from "../models/conversation/conversation.js";
import ConversationMessage from "../models/conversation/conversationMessage.js";
import User, { type IUser } from "../models/user/user.js";
import { dStrings, dynamicMessage } from "../strings.js";
import { createError } from "../utilities/errorHandlers.js";
import SocketService from "./index.js";

export default function mountNewMessageEvent(socket: Socket, user: IUser) {
  socket.on(
    SocketService.CTSEvents.NewMessage,
    async (
      data: {
        conversation: string;
        content: string;
      },
      ack,
    ) => {
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

      const message = await ConversationMessage.create({
        sender: user._id,
        conversation: conversation._id,
        content: content,
        index: conversation.lastMessageIndex + 1,
      });

      conversation.lastActivity = new Date();
      conversation.lastMessageIndex = message.index;

      await conversation.save();

      const participants = await User.find({
        _id: { $in: conversation.participants.map((p) => p.user) },
      })
        .orFail(new Error("Participant not found"))
        .lean();

      const participantMap = new Map<string, IUser>();

      for (const participant of participants) {
        participantMap.set(participant._id.toString(), participant);
      }

      const conversationObj = conversation.toObject();

      const response = {
        ...message.toObject(),
        sender: UserProjectionSchema.essentials.parse(user),
        conversation: {
          ...conversationObj,
          participants: conversationObj.participants.map((p) => ({
            ...p,
            user: participantMap.get(p.user.toString()),
          })),
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
        participants
          .filter((p) => !p._id.equals(user._id))
          .map((p) => ({
            user: p._id,
            message: {
              notification: {
                title: `New message from ${user.name}`,
                body:
                  content.length > 30 ? content.slice(0, 27) + "..." : content,
              },
              data: {
                link: `conversation/${conversation._id}`,
              },
            },
          })),
      );
    },
  );
}
