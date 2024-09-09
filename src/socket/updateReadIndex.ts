import { StatusCodes } from "http-status-codes";
import { Socket } from "socket.io";

import Conversation from "../models/conversation/conversation.js";
import User, { type IUser } from "../models/user/user.js";
import { dStrings, dynamicMessage } from "../strings.js";
import { createError } from "../utilities/errorHandlers.js";
import SocketService from "./index.js";

export default function mountUpdateReadIndexEvent(socket: Socket, user: IUser) {
  socket.on(
    SocketService.CTSEvents.UpdateReadIndex,
    async (
      data: {
        conversation: string;
        index: number;
      },
      ack,
    ) => {
      const { conversation: conversationId, index } = data;

      const conversation = await Conversation.findById(conversationId).orFail(
        createError(dynamicMessage(dStrings.notFound), StatusCodes.NOT_FOUND),
      );

      if (!conversation.participants.some((p) => p.user.equals(user._id))) {
        throw createError(
          "You are not a participant of this conversation",
          StatusCodes.FORBIDDEN,
        );
      }

      if (index > conversation.lastMessageIndex) {
        throw createError(
          "Index is greater than the last message index",
          StatusCodes.BAD_REQUEST,
        );
      }

      let changed = false;
      conversation.participants = conversation.participants.map((p) => {
        if (p.user.equals(user._id)) {
          if (p.read && p.read.index >= index) {
            return p;
          } else {
            changed = true;
            return { ...p, read: { index: index, date: new Date() } };
          }
        } else {
          return p;
        }
      });

      if (changed) {
        conversation.lastActivity = new Date();

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
          ...conversationObj,
          participants: conversationObj.participants.map((p) => ({
            ...p,
            user: participantMap.get(p.user.toString()),
          })),
        };

        conversation.participants.forEach((p) => {
          SocketService.emitToUser(
            p.user,
            SocketService.STCEvents.UpdateReadIndex,
            response,
          );
        });
      }
    },
  );
}
