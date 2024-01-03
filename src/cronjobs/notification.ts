import apn from "@parse/node-apn";
import cron from "node-cron";
import apnProvider from "../config/apn";
import Comment from "../models/Comment";
import Follow from "../models/Follow";
import Notification, {
  NotificationType,
  type INotification,
} from "../models/Notification";
import Reaction from "../models/Reaction";
import User, { type UserDevice } from "../models/User";
import logger from "../api/services/logger";

cron.schedule("*/30 * * * * *", async () => {
  const notifications = await Notification.find({
    readAt: null,
    sent: false,
    updatedAt: { $gt: new Date(Date.now() - 1000 * 60 * 60) },
  });

  if (notifications.length > 0) {
    logger.info(`Sending ${notifications.length} notifications.`);

    for (const notification of notifications) {
      let failReason: string | null = null;
      let hasFailedDevice = false;
      const { title, content, subtitle } = await getNotificationContent(
        notification
      );

      logger.warn(
        `title:[${title}] content:[${content}] subtitle:[${subtitle}]`
      );

      const user = await User.findById(notification.user, "devices");

      if (user.devices.length > 0) {
        const note = new apn.Notification();
        note.alert = {
          title: title,
          body: content,
          subtitle: subtitle,
        };
        note.priority = 5;

        note.topic = "ai.phantomphood.app";
        note.badge = 1;
        note.sound = "default";

        await apnProvider
          .send(
            note,
            user.devices
              .filter((d: UserDevice) => d.apnToken)
              .map((d: UserDevice) => d.apnToken)
          )
          .then((result) => {
            if (result.sent.length === 0) {
              failReason = "Unknown";
            }
            if (result.failed.length > 0) {
              for (const failure of result.failed) {
                if (failReason === "Unknown" && failure.response?.reason) {
                  failReason = failure.response.reason;
                }
                if (failure.response?.reason === "BadDeviceToken") {
                  hasFailedDevice = true;
                  user.devices = user.devices.filter(
                    (d: UserDevice) => d.apnToken !== failure.device
                  );
                }
              }
            }
          })
          .catch((err) => {
            logger.error(
              "Internal server error while sending APN notification",
              { error: err }
            );
          });
      } else {
        failReason = "NoDevices";
      }
      if (failReason) {
        notification.failReason = failReason;
      }
      notification.sent = true;
      await notification.save();
      if (hasFailedDevice) {
        await user.save();
      }
    }
  }
});

export async function getNotificationContent(notification: INotification) {
  let title = "Phantom Phood";
  let subtitle = undefined;
  let content = "You have a new notification.";
  switch (notification.type) {
    case NotificationType.COMMENT:
      await Comment.findById(notification.resources![0]._id)
        .populate("author", ["name", "profileImage"])
        .then((comment) => {
          title = comment.author.name;
          subtitle = "Commented on your activity.";
          content = comment.content;
        });
      break;
    case NotificationType.FOLLOW:
      const follow = await Follow.findById(
        notification.resources![0]._id
      ).populate("user", ["name"]);
      content = `${follow.user.name} followed you.`;
      break;
    case NotificationType.COMMENT_MENTION:
      await Comment.findById(notification.resources![0]._id)
        .populate("author", ["name", "profileImage"])
        .then((comment) => {
          title = comment.author.name;
          subtitle = "Mentioned you in a comment.";
          content = comment.content;
        });
      break;
    case NotificationType.REACTION:
      await Reaction.findById(notification.resources![0]._id)
        .populate("user", ["name", "profileImage"])
        .then((reaction) => {
          title = reaction.user.name;
          if (reaction.type === "emoji") {
            content = `Reacted with ${reaction.reaction} to your activity.`;
          } else {
            content = "Added an special reaction to your activity.";
          }
        });
      break;
    default:
      break;
  }
  return { title, content, subtitle };
}
