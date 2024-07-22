import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import logger from "../../../api/services/logger/index.js";
import { ResourceTypeEnum } from "../../../models/Enum/ResourceTypeEnum.js";
import Follow from "../../../models/Follow.js";
import FollowRequest from "../../../models/FollowRequest.js";
import Notification from "../../../models/Notification.js";
import UserActivity, {
  ActivityTypeEnum,
} from "../../../models/UserActivity.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const params = z.object({
  id: zObjectId,
});

type Params = z.infer<typeof params>;

export const deleteUserConnectionValidation = validateData({
  params: params,
});

export async function deleteUserConnection(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { id } = req.params as unknown as Params;

    const followDoc = await Follow.findOne({
      user: authUser._id,
      target: id,
    });

    if (followDoc) {
      const [deleteFollow, deleteUserActivity, deleteNotification] =
        await Promise.all([
          followDoc.deleteOne(),
          UserActivity.deleteOne({
            userId: authUser._id,
            resourceId: id,
            activityType: ActivityTypeEnum.Following,
            resourceType: ResourceTypeEnum.User,
          }),
          Notification.deleteOne({
            resources: {
              $elemMatch: { _id: followDoc._id, type: ResourceTypeEnum.Follow },
            },
          }),
        ]);

      if (!deleteFollow.deletedCount) {
        logger.error("Error while deleting user connection", {
          error: "Follow not found",
        });
      }

      if (!deleteUserActivity.deletedCount) {
        logger.error("Error while deleting user connection", {
          error: "UserActivity not found",
        });
      }

      if (!deleteNotification.deletedCount) {
        logger.error(
          "Error while deleting notification after deleting user connection",
          { error: "Notification not found" },
        );
      }
    } else {
      const requestDoc = await FollowRequest.findOne({
        user: authUser._id,
        target: id,
      }).orFail(
        createError(
          dynamicMessage(ds.notFound, "Entity"),
          StatusCodes.NOT_FOUND,
        ),
      );

      const [deleteRequest, deleteNotification] = await Promise.all([
        requestDoc.deleteOne(),
        Notification.deleteOne({
          resources: {
            $elemMatch: {
              _id: requestDoc._id,
              type: ResourceTypeEnum.FollowRequest,
            },
          },
        }),
      ]);

      if (!deleteRequest.deletedCount) {
        logger.error("Error while deleting user connection", {
          error: "FollowRequest not found",
        });
      }

      if (!deleteNotification.deletedCount) {
        logger.error(
          "Error while deleting notification after deleting user connection",
          { error: "Notification not found" },
        );
      }
    }

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}
