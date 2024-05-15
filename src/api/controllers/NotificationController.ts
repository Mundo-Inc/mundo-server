import type { NextFunction, Request, Response } from "express";
import { body, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import { type PipelineStage } from "mongoose";

import CheckIn from "../../models/CheckIn";
import Comment from "../../models/Comment";
import Follow from "../../models/Follow";
import FollowRequest from "../../models/FollowRequest";
import Notification, {
  NotificationTypeEnum,
  type INotification,
} from "../../models/Notification";
import { type IPlace } from "../../models/Place";
import Reaction from "../../models/Reaction";
import Review from "../../models/Review";
import { handleInputErrors } from "../../utilities/errorHandlers";
import { getPaginationFromQuery } from "../../utilities/pagination";
import UserProjection, { type UserProjectionEssentials } from "../dto/user";
import validate from "./validators";

async function handleResourceNotFound(notification: INotification) {
  await Notification.findByIdAndDelete(notification._id);
}

async function getNotificationContent(notification: INotification) {
  let user = undefined;
  let title: string | undefined = undefined;
  let content: string | undefined = undefined;
  let image: string | undefined = undefined;
  let activity: string | undefined = undefined;

  switch (notification.type) {
    case NotificationTypeEnum.COMMENT:
      await Comment.findById(notification.resources![0]._id)
        .populate<{
          author: UserProjectionEssentials;
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
    case NotificationTypeEnum.FOLLOW:
      await Follow.findById(notification.resources![0]._id)
        .populate<{
          user: UserProjectionEssentials;
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
    case NotificationTypeEnum.COMMENT_MENTION:
      await Comment.findById(notification.resources![0]._id)
        .populate<{
          author: UserProjectionEssentials;
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
    case NotificationTypeEnum.REACTION:
      await Reaction.findById(notification.resources![0]._id)
        .populate<{
          user: UserProjectionEssentials;
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
    case NotificationTypeEnum.XP:
      title = "XP Gain";
      content = `+ ${notification.content}`;
      break;
    case NotificationTypeEnum.LEVEL_UP:
      title = "Level Up!";
      content = `You've reached level ${notification.content}!`;
      break;
    case NotificationTypeEnum.FOLLOWING_REVIEW:
      await Review.findById(notification.resources![0]._id)
        .populate<{
          writer: UserProjectionEssentials;
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
    case NotificationTypeEnum.FOLLOWING_HOMEMADE:
      await Review.findById(notification.resources![0]._id)
        .populate<{
          userId: UserProjectionEssentials;
        }>({
          path: "userId",
          select: UserProjection.essentials,
        })
        .then((homemade) => {
          if (!homemade) {
            handleResourceNotFound(notification);
          } else {
            user = homemade.userId;
            title = "Posted a new homemade recipe";
            activity = homemade.userActivityId?.toString();
          }
        });
      break;
    case NotificationTypeEnum.FOLLOWING_CHECKIN:
      await CheckIn.findById(notification.resources![0]._id)
        .populate<{
          user: UserProjectionEssentials;
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
    case NotificationTypeEnum.REFERRAL_REWARD:
      title = "Referral Reward";
      const friendName =
        "(" + notification.additionalData?.newUserName + ") " || "";
      content = `Congratulations! You've been credited with ${
        notification.additionalData?.amount || 250
      } Phantom Coins for successfully referring your frined ${friendName} to our app. Thanks for sharing!`;
      break;
    case NotificationTypeEnum.FOLLOW_REQUEST:
      await FollowRequest.findById(notification.resources![0]._id)
        .populate<{
          user: UserProjectionEssentials;
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
    case NotificationTypeEnum.FOLLOW_REQUEST_ACCEPTED:
      await Follow.findById(notification.resources![0]._id)
        .populate<{
          user: UserProjectionEssentials;
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
    default:
      break;
  }
  return { user, title, content, image, activity };
}

export const getNotificationsValidation: ValidationChain[] = [
  validate.page(query("page").optional()),
  validate.limit(query("limit").optional(), 10, 50),
  query("unread").optional().isBoolean().toBoolean(),
  query("v").optional().isNumeric(),
];
export async function getNotifications(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const unread = Boolean(req.query.unread);

    const { page, limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 20,
      maxLimit: 50,
    });

    const v = parseInt(req.query.v as string) || 1;

    const matchPipeline: PipelineStage[] = [
      {
        $match: {
          user: authUser._id,
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

    const result = await Notification.aggregate([
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
    ]).then((result) => result[0]);

    if (result && result.notifications.length > 0) {
      for (const notification of result.notifications) {
        const { user, title, content, image, activity } =
          await getNotificationContent(notification);

        if (user) {
          notification.user = user;
        } else {
          delete notification.user;
        }
        if (content) {
          notification.content = content;
        }
        if (title) {
          notification.title = title;
        }
        if (image) {
          notification.image = image;
        }
        if (activity) {
          notification.activity = activity;
        }

        // TODO: Remove after the client is updated
        if (v !== 2 && !notification.content && notification.title) {
          notification.content = notification.title;
        }
      }

      result.notifications = result.notifications.filter(
        (n: { content?: string; title?: string }) =>
          (n.content && n.content.length > 0) || (n.title && n.title.length > 0)
      );
    }

    res.status(StatusCodes.OK).json({
      success: true,
      // TODO: Remove extra checks after the client is updated
      data:
        v === 2
          ? result?.notifications || []
          : result
          ? result
          : { notifications: [], total: 0 },
      // TODO: Remove hasMore after the client is updated
      hasMore: result && result.total > page * limit,
      pagination: {
        totalCount: result ? result.total : 0,
        page: page,
        limit: limit,
      },
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

    const authUser = req.user!;
    const { date } = req.body;

    await Notification.updateMany(
      {
        user: authUser._id,
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
