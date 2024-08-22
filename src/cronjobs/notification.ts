import cron from "node-cron";

import { UserProjection, type UserProjectionType } from "../api/dto/user.js";
import logger from "../api/services/logger/index.js";
import NotificationsService, {
  type NotificationItemByToken,
} from "../api/services/notificationsService.js";
import CheckIn from "../models/checkIn.js";
import Comment from "../models/comment.js";
import Follow from "../models/follow.js";
import Homemade from "../models/homemade.js";
import Notification, {
  NotificationTypeEnum,
  type INotification,
} from "../models/notification.js";
import type { IPlace } from "../models/place.js";
import Reaction from "../models/reaction.js";
import Review from "../models/review.js";
import User, { type IUser } from "../models/user/user.js";
import type { IUserDevice } from "../models/user/userDevice.js";

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
      const { title, content, link } =
        await getNotificationContent(notification);

      const user = await User.findById(notification.user)
        .select<{ devices: IUser["devices"] }>("devices")
        .lean();

      if (user && user.devices.length > 0) {
        const items: NotificationItemByToken[] = user.devices
          .filter((d: IUserDevice) => Boolean(d.fcmToken))
          .map((d: IUserDevice) => ({
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
              items,
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

  try {
    switch (notification.type) {
      case NotificationTypeEnum.Comment:
        await Comment.findById(notification.resources![0]._id)
          .orFail()
          .populate<{
            author: Pick<IUser, "_id" | "name">;
          }>("author", ["name"])
          .then((comment) => {
            title = `${comment.author.name} commented on your activity.`;
            content = comment.content;
            link = `activity/${comment.userActivity}`;
          });
        break;
      case NotificationTypeEnum.Follow:
        const follow = await Follow.findById(notification.resources![0]._id)
          .orFail()
          .populate<{
            user: Pick<IUser, "_id" | "name">;
          }>("user", ["name"]);
        content = `${follow.user.name} followed you.`;
        break;
      case NotificationTypeEnum.CommentMention:
        await Comment.findById(notification.resources![0]._id)
          .orFail()
          .populate<{
            author: Pick<IUser, "_id" | "name">;
          }>("author", ["name"])
          .then((comment) => {
            title = `${comment.author.name} mentioned you in a comment.`;
            content = comment.content;
            link = `activity/${comment.userActivity}`;
          });
        break;
      case NotificationTypeEnum.Reaction:
        await Reaction.findById(notification.resources![0]._id)
          .orFail()
          .populate<{
            user: Pick<IUser, "_id" | "name">;
          }>("user", ["name"])
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
      case NotificationTypeEnum.FollowingReview:
        await Review.findById(notification.resources![0]._id)
          .orFail()
          .populate<{
            writer: UserProjectionType["essentials"];
          }>({
            path: "writer",
            select: UserProjection.essentials,
          })
          .populate<{
            place: IPlace;
          }>("place")
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
      case NotificationTypeEnum.FollowingHomemade:
        await Homemade.findById(notification.resources![0]._id)
          .orFail()
          .populate<{
            userId: UserProjectionType["essentials"];
          }>({
            path: "userId",
            select: UserProjection.essentials,
          })
          .then((homemade) => {
            title = `New post from ${homemade.userId.name}`;
            content = homemade.content;
            link = `activity/${homemade.userActivityId}`;
          });
        break;
      case NotificationTypeEnum.FollowingCheckIn:
        await CheckIn.findById(notification.resources![0]._id)
          .orFail()
          .populate<{
            user: UserProjectionType["essentials"];
          }>({
            path: "user",
            select: UserProjection.essentials,
          })
          .populate<{
            place: IPlace;
          }>("place")
          .then((checkin) => {
            title = checkin.user.name;
            content = `${checkin.user.name} checked into ${checkin.place.name}`;
            link = `place/${checkin.place._id}`;
          });
        break;
      case NotificationTypeEnum.ReferralReward:
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
  } catch (error) {
    logger.error(`Error in getNotificationContent: ${error}`);
  }
  return { title, content, link };
}
