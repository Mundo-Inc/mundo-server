import { Socket } from "socket.io";

import type { IUser } from "../models/user/user.js";
import SocketService from "./index.js";

export default function mountRequestEvent(socket: Socket, user: IUser) {
  socket.on(SocketService.CTSEvents.Request, async (data, ack) => {
    const event = data.event as SocketService.RequestEvents;
    const type: "emit" | "ack" = data.type;

    switch (event) {
      case SocketService.RequestEvents.Earnings:
        if (type === "emit") {
          SocketService.emitToUser(
            user._id,
            SocketService.STCEvents.Earnings,
            user.earnings,
          );
        } else {
          ack(user.earnings);
        }
        break;
      default:
        break;
    }
  });
}
