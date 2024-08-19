import { StatusCodes } from "http-status-codes";
import { Server } from "socket.io";

import { authenticateSocket } from "./api/middlewares/authMiddleWare.js";
import { server } from "./app.js";
import mountRequestEvent from "./socket/request.js";
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

    mountRequestEvent(socket, user);
  } catch (error) {
    socket.disconnect(true);
  }
});
