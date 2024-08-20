import type { Types } from "mongoose";

import { io } from "../socket.js";

namespace SocketService {
  export enum CTSEvents {
    Request = "request",
    NewMessage = "newMessage",
  }

  export enum STCEvents {
    Earnings = "earnings",

    // Conversation
    NewConversation = "newConversation",
    NewMessage = "newMessage",
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
