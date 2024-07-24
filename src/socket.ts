import { StatusCodes } from "http-status-codes";
import type { Types } from "mongoose";
import { Server } from "socket.io";

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
  } catch (error) {
    socket.disconnect(true);
  }
});

namespace Socket {
  export enum Events {
    Earnings = "earnings",
  }

  export function emitToUser(
    userId: Types.ObjectId,
    event: Events,
    data: string,
  ) {
    io.to(`u:${userId.toString()}`).emit(event, data);
  }

  export function emitToAll(event: string, data: string) {
    io.emit(event, data);
  }
}

export default Socket;
