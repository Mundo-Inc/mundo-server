import { StatusCodes } from "http-status-codes";
import type { Types } from "mongoose";
import { Server } from "socket.io";

import { getUserEarnings } from "./api/controllers/user/helper.js";
import { authenticateSocket } from "./api/middlewares/authMiddleWare.js";
import { server } from "./app.js";
import { createError } from "./utilities/errorHandlers.js";

export const io = new Server(server, {
  serveClient: false,
  cors: {
    origin: "*",
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  },
});

io.on("connection", async (socket) => {
  try {
    const user = await authenticateSocket(socket);

    if (!user) {
      throw createError("Unauthorized", StatusCodes.UNAUTHORIZED);
    }

    await socket.join(`u:${user._id.toString()}`);
    // mountJoinChatEvent(socket, user._id);

    socket.on(SocketService.EventsEnum.Request, async (data, ack) => {
      const event: SocketService.EventsEnum = data.event;
      const type: "emit" | "ack" = data.type;

      switch (event) {
        case SocketService.EventsEnum.Earnings:
          await getUserEarnings(user._id).then((earnings) => {
            if (type === "emit") {
              SocketService.emitToUser(user._id, event, earnings);
            } else {
              ack(earnings);
            }
          });
          break;
        default:
          break;
      }
    });
  } catch (error) {
    socket.disconnect(true);
  }
});

namespace SocketService {
  export enum EventsEnum {
    Earnings = "earnings",
    Request = "request",

    // Chat
    JoinChat = "joinChat",
  }

  export function emitToUser(
    userId: Types.ObjectId,
    event: EventsEnum,
    data: any,
  ) {
    io.to(`u:${userId.toString()}`).emit(event, data);
  }

  export function emitToAll(event: string, data: any) {
    io.emit(event, data);
  }
}

export default SocketService;
