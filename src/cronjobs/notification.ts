import { Types } from "mongoose";
import cron from "node-cron";

import logger from "../api/services/logger";
import {
  NotificationsService,
  type NotificationItemByToken,
} from "../api/services/notifications.service";
import CheckIn from "../models/CheckIn";
import Comment from "../models/Comment";
import Follow from "../models/Follow";
import Homemade from "../models/Homemade";
import Notification, {
  NotificationTypeEnum,
  type INotification,
} from "../models/Notification";
import Reaction from "../models/Reaction";
import Review from "../models/Review";
import User, { type UserDevice } from "../models/User";
import UserProjection from "../api/dto/user/user";

cron.schedule("*/30 * * * * *", async () => {
  const notifications = await Notification.find({
    readAt: null,
    sent: false,
    updatedAt: { $gt: new Date(Date.now() - 1000 * 60 * 60) },
  });

  if (notifications.length > 0) {
    logger.verbose(`Sending ${notifications.length} notifications.`);

    for (const notification of notifications) {
      let failReason: string | null = null;
      const { title, content, link } = await getNotificationContent(
        notification
      );

      const user: {
        _id: Types.ObjectId;
        devices?: UserDevice[];
      } | null = await User.findById(notification.user, "devices").lean();

      if (user && user.devices && user.devices.length > 0) {
        const items: NotificationItemByToken[] = user.devices
          .filter((d: UserDevice) => Boolean(d.fcmToken))
          .map((d: UserDevice) => ({
            tokenMessage: {
              notification: {
                title,
                body: content,
              },
              data: {
                link,
              },
              token: d.fcmToken!,
            },
            user: notification.user,
          }));

        try {
          const batchResponse =
            await NotificationsService.getInstance().sendNotificationsByToken(
              items
            );

          if (!batchResponse || batchResponse.successCount == 0) {
            failReason = "NoDevices/InternalError";
          }
        } catch (error) {
          failReason = "NoDevices/InternalError";
        }
      } else {
        failReason = "NoDevices";
      }

      if (failReason) {
        notification.failReason = failReason;
      }
      notification.sent = true;

      await notification.save();
    }
  }
});

export async function getNotificationContent(notification: INotification) {
  let title = "Phantom Phood";
  let content = "You have a new notification.";
  let link = "inbox/notifications";

  switch (notification.type) {
    case NotificationTypeEnum.COMMENT:
      await Comment.findById(notification.resources![0]._id)
        .populate("author", ["name", "profileImage"])
        .then((comment) => {
          title = `${comment.author.name} commented on your activity.`;
          content = comment.content;
          link = `activity/${comment.userActivity}`;
        });
      break;
    case NotificationTypeEnum.FOLLOW:
      const follow = await Follow.findById(
        notification.resources![0]._id
      ).populate("user", ["name"]);
      content = `${follow.user.name} followed you.`;
      break;
    case NotificationTypeEnum.COMMENT_MENTION:
      await Comment.findById(notification.resources![0]._id)
        .populate("author", ["name", "profileImage"])
        .then((comment) => {
          title = `${comment.author.name} mentioned you in a comment.`;
          content = comment.content;
          link = `activity/${comment.userActivity}`;
        });
      break;
    case NotificationTypeEnum.REACTION:
      await Reaction.findById(notification.resources![0]._id)
        .populate("user", ["name", "profileImage"])
        .then((reaction) => {
          title = reaction.user.name;
          if (reaction.type === "emoji") {
            content = `Reacted with ${reaction.reaction} to your activity.`;
          } else {
            content = "Added an special reaction to your activity.";
          }
          link = `activity/${reaction.target}`;
        });
      break;
    case NotificationTypeEnum.FOLLOWING_REVIEW:
      await Review.findById(notification.resources![0]._id)
        .populate({
          path: "writer",
          select: UserProjection.essentials,
        })
        .populate("place")
        .then((review) => {
          title = `${review.writer.name} reviewed ${review.place.name}`;
          content = review.content;
          if (review.scores && review.scores.overall) {
            title += ` ${review.scores.overall}/5⭐️`;
          }
          link = review.userActivityId
            ? `activity/${review.userActivityId}`
            : `place/${review.place._id}`;
        });
      break;
    case NotificationTypeEnum.FOLLOWING_HOMEMADE:
      await Homemade.findById(notification.resources![0]._id)
        .populate({
          path: "userId",
          select: UserProjection.essentials,
        })
        .then((homemade) => {
          title = `New post from ${homemade.userId.name}`;
          content = homemade.content;
          link = `activity/${homemade.userActivityId}`;
        });
      break;
    case NotificationTypeEnum.FOLLOWING_CHECKIN:
      await CheckIn.findById(notification.resources![0]._id)
        .populate({
          path: "user",
          select: UserProjection.essentials,
        })
        .populate("place")
        .then((checkin) => {
          title = checkin.user.name;
          content = `${checkin.user.name} checked into ${checkin.place.name}`;
          link = `place/${checkin.place._id}`;
        });
      break;
    case NotificationTypeEnum.REFERRAL_REWARD:
      title = "Referral Reward";
      const friendName =
        "(" + notification.additionalData?.newUserName + ") " || "";
      content =
        `Congratulations! You've been credited with ${
          notification.additionalData?.amount || 250
        } Phantom Coins for successfully referring your frined ` +
        friendName +
        `to our app. Thanks for sharing!`;
      break;
    default:
      break;
  }
  return { title, content, link };
}
