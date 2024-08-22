import { Socket } from "socket.io";

import { getUserEarnings } from "../api/controllers/user/helper.js";
import type { UserProjectionType } from "../api/dto/user.js";
import SocketService from "./index.js";

export default function mountRequestEvent(
  socket: Socket,
  user: UserProjectionType["private"],
) {
  socket.on(SocketService.CTSEvents.Request, async (data, ack) => {
    const event = data.event as SocketService.RequestEvents;
    const type: "emit" | "ack" = data.type;

    switch (event) {
      case SocketService.RequestEvents.Earnings:
        await getUserEarnings(user._id).then((earnings) => {
          if (type === "emit") {
            SocketService.emitToUser(
              user._id,
              SocketService.STCEvents.Earnings,
              earnings,
            );
          } else {
            ack(earnings);
          }
        });
        break;
      default:
        break;
    }
  });
}
