import cron from "node-cron";
import apnProvider from "../config/apn";
import apn from "@parse/node-apn";
import Notification, {
  INotification,
  NotificationType,
} from "../models/Notification";
import User from "../models/User";
import Follow from "../models/Follow";
import Comment from "../models/Comment";
import Reaction from "../models/Reaction";

type device = {
  token: string;
  platform: string;
};

cron.schedule("*/30 * * * * *", async () => {
  const notifications = await Notification.find({
    sent: false,
    updatedAt: { $gt: new Date(Date.now() - 1000 * 60 * 60) },
  });

  console.log(notifications.length);

  for (const notification of notifications) {
    let failReason: string | null = null;
    let hasFailedDevice = false;
    const { title, content, subtitle } = await getNotificationContent(
      notification
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
          user.devices.map((d: device) => d.token)
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
                  (d: device) => d.token !== failure.device
                );
              }
            }
          }
        })
        .catch((err) => {
          console.log("ERROR", err);
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

  console.log("Done");

  // let note = new apn.Notification();
  // note.alert = "Hello, world!";
  // note.topic = "ai.phantomphood.app";
  // note.badge = 1;
  // note.sound = "default";

  // apnProvider
  //   .send(
  //     note,
  //     "fccf6a18ee83215e9e72069aee900e632ad538507a147334fa9ac16bcc2ec5ec"
  //   )
  //   .then((result) => {
  //     console.log(result);
  //   });
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
