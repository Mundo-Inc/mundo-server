import { StatusCodes } from "http-status-codes";
import { Server } from "socket.io";

import { authenticateSocket } from "./api/middlewares/authMiddleWare.js";
import { server } from "./app.js";
import SocketService from "./socket/index.js";
import mountNewMessageEvent from "./socket/newMessage.js";
import mountRequestEvent from "./socket/request.js";
import mountUpdateReadIndexEvent from "./socket/updateReadIndex.js";
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

    try {
      mountRequestEvent(socket, user);
      mountNewMessageEvent(socket, user);
      mountUpdateReadIndexEvent(socket, user);
    } catch (error) {
      socket.emit(SocketService.STCEvents.Error, error);
    }
  } catch (error) {
    socket.disconnect(true);
  }
});
