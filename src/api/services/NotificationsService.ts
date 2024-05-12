import { messaging } from "firebase-admin";
import type { BaseMessage } from "firebase-admin/lib/messaging/messaging-api";
import mongoose, { Types } from "mongoose";

import User, { type UserDevice } from "../../models/User";
import logger from "./logger";

export interface NotificationItemByToken {
  tokenMessage: messaging.TokenMessage;
  user: string | Types.ObjectId;
}

export interface NotificationItemByUser {
  message: BaseMessage;
  user: string | Types.ObjectId;
}

export class NotificationsService {
  private static instance = new NotificationsService();

  private messaging: messaging.Messaging;

  private constructor() {
    this.messaging = messaging();
  }

  public static getInstance(): NotificationsService {
    if (!NotificationsService.instance) {
      NotificationsService.instance = new NotificationsService();
    }
    return NotificationsService.instance;
  }

  public async sendNotificationsByToken(items: NotificationItemByToken[]) {
    if (items.length > 500) {
      // send in batches of 500 (max allowed by FCM)
      let responses: messaging.BatchResponse | undefined = undefined;

      for (let i = 0; i < items.length; i += 500) {
        try {
          const batchResponse = await this.messaging.sendEach(
            items.slice(i, i + 500).map((i) => i.tokenMessage)
          );

          if (batchResponse.failureCount > 0) {
            await this.handleTokenDeletion(
              items.slice(i, i + 500),
              batchResponse
            );
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
          logger.verbose("Error sending notification", { error });
        }
      }

      if (!responses) {
        return false;
      } else {
        return responses;
      }
    } else {
      try {
        const batchResponse = await this.messaging.sendEach(
          items.map((i) => i.tokenMessage)
        );

        if (batchResponse.failureCount > 0) {
          await this.handleTokenDeletion(items, batchResponse);
        }

        return batchResponse;
      } catch (error) {
        logger.verbose("Error sending notification", { error });
        return false;
      }
    }
  }

  public async sendNotificationsByUser(items: NotificationItemByUser[]) {
    const tokenMessages: NotificationItemByToken[] = [];

    for (const item of items) {
      const user: {
        _id: Types.ObjectId;
        devices: UserDevice[];
      } | null = await User.findById(item.user, "devices").lean();

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
      tokenMessage: messaging.TokenMessage;
      user: string | Types.ObjectId;
    }[],
    batchResponse: messaging.BatchResponse
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

    for (const [userId, tokens] of Object.entries(toDelete)) {
      await User.findOneAndUpdate(
        { _id: new mongoose.Types.ObjectId(userId) },
        { $pull: { devices: { fcmToken: { $in: tokens } } } }
      );
    }
  }
}
