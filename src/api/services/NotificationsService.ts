import {
  getMessaging,
  type BaseMessage,
  type BatchResponse,
  type TokenMessage,
} from "firebase-admin/messaging";
import { Types } from "mongoose";

import { MundoApp } from "../../config/firebase-config.js";
import User, { type IUser } from "../../models/User.js";
import logger from "./logger/index.js";

export interface NotificationItemByToken {
  tokenMessage: TokenMessage;
  user: string | Types.ObjectId;
}

export interface NotificationItemByUser {
  message: BaseMessage;
  user: string | Types.ObjectId;
}

export default class NotificationsService {
  private static instance = new NotificationsService();

  private constructor() {}

  public static getInstance(): NotificationsService {
    if (!NotificationsService.instance) {
      NotificationsService.instance = new NotificationsService();
    }
    return NotificationsService.instance;
  }

  public async sendNotificationsByToken(items: NotificationItemByToken[]) {
    let responses: BatchResponse | undefined = undefined;

    for (let i = 0; i < items.length; i += 500) {
      try {
        const batchItems = items.slice(i, i + 500);
        const batchResponse = await getMessaging(MundoApp).sendEach(
          batchItems.map((i) => i.tokenMessage)
        );

        if (batchResponse.failureCount > 0) {
          await this.handleTokenDeletion(batchItems, batchResponse);
        }

        if (!responses) {
          responses = batchResponse;
        } else {
          responses.responses = responses.responses.concat(
            batchResponse.responses
          );
          responses.successCount += batchResponse.successCount;
          responses.failureCount += batchResponse.failureCount;
        }
      } catch (error) {
        logger.error("Error sending notification", { error });
      }
    }

    return responses || false;
  }

  public async sendNotificationsByUser(items: NotificationItemByUser[]) {
    const tokenMessages: NotificationItemByToken[] = [];

    for (const item of items) {
      const user = await User.findById(item.user)
        .select<{
          devices: IUser["devices"];
        }>("devices")
        .lean();

      if (!user) {
        logger.warn(`User ${item.user} not found. Skipping notification.`);
        continue;
      }

      for (const device of user.devices) {
        if (device.fcmToken) {
          tokenMessages.push({
            tokenMessage: {
              ...item.message,
              token: device.fcmToken,
            },
            user: item.user,
          });
        }
      }
    }

    return this.sendNotificationsByToken(tokenMessages);
  }

  private async handleTokenDeletion(
    items: {
      tokenMessage: TokenMessage;
      user: string | Types.ObjectId;
    }[],
    batchResponse: BatchResponse
  ) {
    const toDelete: { [userId: string]: string[] } = {};

    for (const [index, item] of batchResponse.responses.entries()) {
      if (
        !item.success &&
        item.error?.code === "messaging/registration-token-not-registered"
      ) {
        const stringUserId = items[index].user.toString();
        toDelete[stringUserId] = toDelete[stringUserId] || [];
        toDelete[stringUserId].push(items[index].tokenMessage.token);
      }
    }

    const deletionPromises = Object.entries(toDelete).map(([userId, tokens]) =>
      User.findOneAndUpdate(
        { _id: new Types.ObjectId(userId) },
        { $pull: { devices: { fcmToken: { $in: tokens } } } }
      )
    );

    await Promise.all(deletionPromises);
  }
}
