import type { NextFunction, Request, Response } from "express";
import { body, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import CheckIn from "../../models/CheckIn";
import Comment from "../../models/Comment";
import Follow from "../../models/Follow";
import Notification, {
  NotificationTypeEnum,
  type INotification,
} from "../../models/Notification";
import Reaction from "../../models/Reaction";
import Review from "../../models/Review";
import { handleInputErrors } from "../../utilities/errorHandlers";
import { publicReadUserEssentialProjection } from "../dto/user/read-user-public.dto";
import validate from "./validators";

async function handleResourceNotFound(notification: INotification) {
  await Notification.findByIdAndDelete(notification._id);
}

async function getNotificationContent(notification: INotification) {
  let user = undefined;
  let title = "Phantom Phood";
  let subtitle = undefined;
  let content = undefined;
  let image = undefined;
  let activity = undefined;
  let error = false;

  switch (notification.type) {
    case NotificationTypeEnum.COMMENT:
      await Comment.findById(notification.resources![0]._id)
        .populate({
          path: "author",
          select: publicReadUserEssentialProjection,
        })
        .then((comment) => {
          if (!comment) {
            handleResourceNotFound(notification);
            error = true;
          } else {
            user = comment.author;
            image = comment.author.profileImage;
            title = comment.author.name;
            subtitle = "Commented on your activity";
            content = comment.content;
            activity = comment.userActivity;
          }
        });
      break;
    case NotificationTypeEnum.FOLLOW:
      await Follow.findById(notification.resources![0]._id)
        // .populate("user")
        .populate({
          path: "user",
          select: publicReadUserEssentialProjection,
        })
        .then((follow) => {
          if (!follow) {
            handleResourceNotFound(notification);
            error = true;
          } else {
            user = follow.user;
            image = follow.user.profileImage;
            title = follow.user.name;
            content = "Started following you.";
          }
        });
      break;
    case NotificationTypeEnum.COMMENT_MENTION:
      await Comment.findById(notification.resources![0]._id)
        .populate({
          path: "author",
          select: publicReadUserEssentialProjection,
        })
        .then((comment) => {
          if (!comment) {
            handleResourceNotFound(notification);
            error = true;
          } else {
            user = comment.author;
            title = comment.author.name;
            image = comment.author.profileImage;
            subtitle = "Mentioned you in a comment.";
            content = comment.content;
            activity = comment.userActivity;
          }
        });
      break;
    case NotificationTypeEnum.REACTION:
      await Reaction.findById(notification.resources![0]._id)
        .populate({
          path: "user",
          select: publicReadUserEssentialProjection,
        })
        .then((reaction) => {
          if (!reaction) {
            handleResourceNotFound(notification);
            error = true;
          } else {
            user = reaction.user;
            title = reaction.user.name;
            activity = reaction.target;
            if (reaction.type === "emoji") {
              content = `Reacted with ${reaction.reaction} to your activity.`;
            } else {
              content = "Added an special reaction to your activity.";
            }
          }
        });
      break;
    case NotificationTypeEnum.XP:
      title = "XP Gain!";
      content = `You gained ${notification.content} XP.`;
      image = "XPGain";
      user = null;
      break;
    case NotificationTypeEnum.LEVEL_UP:
      title = "Level Up!";
      content = `You reached level ${notification.content}!`;
      image = "LevelUp";
      user = null;
      break;
    case NotificationTypeEnum.FOLLOWING_REVIEW:
      await Review.findById(notification.resources![0]._id)
        .populate({
          path: "writer",
          select: publicReadUserEssentialProjection,
        })
        .populate("place")
        .then((review) => {
          if (!review) {
            handleResourceNotFound(notification);
            error = true;
          } else {
            title = review.writer.name;
            user = review.writer;
            image = review.writer.profileImage;
            content = `${review.writer.name} reviewed ${review.place.name}`;
            if (review.scores && review.scores.overall) {
              content = `${review.writer.name} rated ${review.place.name} ${review.scores.overall}/5⭐️`;
            }
            activity = review.userActivityId;
            subtitle = review.content;
          }
        });
      break;
    case NotificationTypeEnum.FOLLOWING_CHECKIN:
      await CheckIn.findById(notification.resources![0]._id)
        .populate({
          path: "user",
          select: publicReadUserEssentialProjection,
        })
        .populate("place")
        .then((checkin) => {
          if (!checkin) {
            handleResourceNotFound(notification);
            error = true;
          }
          title = checkin.user.name;
          user = checkin.user;
          image = checkin.user.profileImage;
          content = `${checkin.user.name} checked into ${checkin.place.name}`;
          activity = checkin.userActivityId;
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
  return { title, content, subtitle, image, user, activity, error };
}

export const getNotificationsValidation: ValidationChain[] = [
  validate.page(query("page").optional()),
  validate.limit(query("limit").optional(), 10, 50),
  query("unread").optional().isBoolean(),
];
export async function getNotifications(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: authId } = req.user!;

    const { unread } = req.query;
    const limit = Number(req.query.limit) || 10;
    const page = Number(req.query.page) || 1;
    const skip = (page - 1) * limit;

    const matchPipeline: any[] = [
      {
        $match: {
          user: new mongoose.Types.ObjectId(authId),
        },
      },
    ];

    if (unread) {
      matchPipeline.push({
        $match: {
          readAt: null,
        },
      });
    }

    const notifications = await Notification.aggregate([
      ...matchPipeline,
      {
        $sort: {
          createdAt: -1,
        },
      },
      {
        $facet: {
          notifications: [
            {
              $skip: skip,
            },
            {
              $limit: limit,
            },
          ],
          total: [
            {
              $count: "total",
            },
          ],
        },
      },
      {
        $unwind: "$total",
      },
      {
        $project: {
          notifications: 1,
          total: "$total.total",
        },
      },
    ]);

    if (notifications.length > 0 && notifications[0].notifications.length > 0) {
      for (const notification of notifications[0].notifications) {
        const { content, title, subtitle, user, image, activity, error } =
          await getNotificationContent(notification);
        if (error) {
          notification.error = true;
          continue;
        }
        if (user) {
          notification.user = user;
        } else {
          delete notification.user;
        }
        if (image) {
          notification.image = image;
        }
        if (content) {
          notification.content = content;
        }
        if (subtitle) {
          notification.subtitle = subtitle;
        }
        if (title) {
          notification.title = title;
        }
        if (activity) {
          notification.activity = activity;
        }
      }

      notifications[0].notifications = notifications[0].notifications.filter(
        (
          n: INotification & {
            error?: boolean;
          }
        ) => !n.error
      );
    }

    res.status(StatusCodes.OK).json({
      success: true,
      data:
        notifications.length > 0
          ? notifications[0]
          : {
              notifications: [],
              total: 0,
            },
      hasMore:
        notifications.length > 0
          ? notifications[0].total > page * limit
          : false,
    });
  } catch (err) {
    next(err);
  }
}

export const readNotificationsValidation: ValidationChain[] = [
  body("date").exists().isNumeric(),
];
export async function readNotifications(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: authId } = req.user!;
    const { date } = req.body;

    await Notification.updateMany(
      {
        user: authId,
        readAt: null,
        createdAt: {
          $lte: new Date(date),
        },
      },
      {
        readAt: new Date(date),
      }
    );

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}
