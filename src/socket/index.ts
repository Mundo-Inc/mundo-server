import type { Types } from "mongoose";

import { io } from "../socket.js";

namespace SocketService {
  export enum CTSEvents {
    Request = "request",
    NewMessage = "newMessage",
    UpdateReadIndex = "updateReadIndex",
  }

  export enum STCEvents {
    Earnings = "earnings",
    UpdateReadIndex = "updateReadIndex",
    Error = "error",

    // Conversation
    NewMessage = "newMessage",
    DeleteConversation = "deleteConversation",
  }

  export enum RequestEvents {
    Earnings = "earnings",
  }

  export function emitToUser<T>(
    userId: Types.ObjectId,
    event: STCEvents,
    data: T,
  ) {
    io.to(`u:${userId.toString()}`).emit(event, data);
  }

  export function emitToAll<T>(event: STCEvents, data: T) {
    io.emit(event, data);
  }
}

export default SocketService;
