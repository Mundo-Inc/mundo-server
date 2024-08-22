import {
  UserProjection,
  type UserProjectionType,
} from "../../../api/dto/user.js";
import CheckIn from "../../../models/checkIn.js";
import Comment from "../../../models/comment.js";
import Follow from "../../../models/follow.js";
import FollowRequest from "../../../models/followRequest.js";
import Homemade from "../../../models/homemade.js";
import type { INotification } from "../../../models/notification.js";
import Notification, {
  NotificationTypeEnum,
} from "../../../models/notification.js";
import type { IPlace } from "../../../models/place.js";
import Reaction from "../../../models/reaction.js";
import Review from "../../../models/review.js";

async function handleResourceNotFound(notification: INotification) {
  await Notification.findByIdAndDelete(notification._id);
}

export async function getNotificationContent(notification: INotification) {
  let user = undefined;
  let title: string | undefined = undefined;
  let content: string | undefined = undefined;
  let activity: string | undefined = undefined;

  switch (notification.type) {
    case NotificationTypeEnum.Comment:
      await Comment.findById(notification.resources![0]._id)
        .populate<{
          author: UserProjectionType["essentials"];
        }>({
          path: "author",
          select: UserProjection.essentials,
        })
        .then((comment) => {
          if (!comment) {
            handleResourceNotFound(notification);
          } else {
            user = comment.author;
            title = "Commented on your activity";
            content = comment.content;
            activity = comment.userActivity.toString();
          }
        });
      break;
    case NotificationTypeEnum.Follow:
      await Follow.findById(notification.resources![0]._id)
        .populate<{
          user: UserProjectionType["essentials"];
        }>({
          path: "user",
          select: UserProjection.essentials,
        })
        .then((follow) => {
          if (!follow) {
            handleResourceNotFound(notification);
          } else {
            user = follow.user;
            title = "Started following you";
          }
        });
      break;
    case NotificationTypeEnum.CommentMention:
      await Comment.findById(notification.resources![0]._id)
        .populate<{
          author: UserProjectionType["essentials"];
        }>({
          path: "author",
          select: UserProjection.essentials,
        })
        .then((comment) => {
          if (!comment) {
            handleResourceNotFound(notification);
          } else {
            user = comment.author;
            title = "Mentioned you in a comment.";
            content = comment.content;
            activity = comment.userActivity.toString();
          }
        });
      break;
    case NotificationTypeEnum.Reaction:
      await Reaction.findById(notification.resources![0]._id)
        .populate<{
          user: UserProjectionType["essentials"];
        }>({
          path: "user",
          select: UserProjection.essentials,
        })
        .then((reaction) => {
          if (!reaction) {
            handleResourceNotFound(notification);
          } else {
            user = reaction.user;
            if (reaction.type === "emoji") {
              title = `Reacted with ${reaction.reaction} to your activity.`;
            } else {
              title = "Added an special reaction to your activity.";
            }
            activity = reaction.target.toString();
          }
        });
      break;
    case NotificationTypeEnum.FollowingReview:
      await Review.findById(notification.resources![0]._id)
        .populate<{
          writer: UserProjectionType["essentials"];
        }>({
          path: "writer",
          select: UserProjection.essentials,
        })
        .populate<{
          place: Pick<IPlace, "name">;
        }>({
          path: "place",
          select: "name",
        })
        .then((review) => {
          if (!review) {
            handleResourceNotFound(notification);
          } else {
            user = review.writer;
            title = `Reviewed ${review.place.name}`;
            if (review.scores && review.scores.overall) {
              content = `${review.scores.overall}/5⭐️ - ${
                review.content.length > 30
                  ? review.content.slice(0, 27) + "..."
                  : review.content
              }`;
            } else if (review.content && review.content.length > 0) {
              content = `${
                review.content.length > 30
                  ? review.content.slice(0, 27) + "..."
                  : review.content
              }`;
            } else {
              content = `${review.writer.name} reviewed ${review.place.name}`;
            }
            activity = review.userActivityId?.toString();
          }
        });
      break;
    case NotificationTypeEnum.FollowingHomemade:
      await Homemade.findById(notification.resources![0]._id)
        .populate<{
          user: UserProjectionType["essentials"];
        }>({
          path: "user",
          select: UserProjection.essentials,
        })
        .then((homemade) => {
          if (!homemade) {
            handleResourceNotFound(notification);
          } else {
            user = homemade.user;
            title = "Posted a new homemade recipe";
            activity = homemade.userActivityId?.toString();
          }
        });
      break;
    case NotificationTypeEnum.FollowingCheckIn:
      await CheckIn.findById(notification.resources![0]._id)
        .populate<{
          user: UserProjectionType["essentials"];
        }>({
          path: "user",
          select: UserProjection.essentials,
        })
        .populate<{
          place: Pick<IPlace, "name">;
        }>({
          path: "place",
          select: "name",
        })
        .then((checkin) => {
          if (!checkin) {
            handleResourceNotFound(notification);
          } else {
            user = checkin.user;
            title = `Checked into ${checkin.place.name}`;
            activity = checkin.userActivityId?.toString();
          }
        });
      break;
    case NotificationTypeEnum.ReferralReward:
      title = "Referral Reward";
      const friendName =
        "(" + notification.additionalData?.newUserName + ") " || "";
      content = `Congratulations! You've been credited with ${
        notification.additionalData?.amount || 250
      } Phantom Coins for successfully referring your frined ${friendName} to our app. Thanks for sharing!`;
      break;
    case NotificationTypeEnum.FollowRequest:
      await FollowRequest.findById(notification.resources![0]._id)
        .populate<{
          user: UserProjectionType["essentials"];
        }>({
          path: "user",
          select: UserProjection.essentials,
        })
        .then((followRequest) => {
          if (!followRequest) {
            handleResourceNotFound(notification);
          } else {
            user = followRequest.user;
            title = "Sent you a follow request";
          }
        });
      break;
    case NotificationTypeEnum.FollowRequestAccepted:
      await Follow.findById(notification.resources![0]._id)
        .populate<{
          user: UserProjectionType["essentials"];
        }>({
          path: "user",
          select: UserProjection.essentials,
        })
        .then((follow) => {
          if (!follow) {
            handleResourceNotFound(notification);
          } else {
            user = follow.target;
            title = "Accepted your follow request";
          }
        });
      break;
    default:
      break;
  }
  return { user, title, content, activity };
}
