import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import logger from "../../../api/services/logger/index.js";
import { ResourceTypeEnum } from "../../../models/Enum/ResourceTypeEnum.js";
import Follow from "../../../models/Follow.js";
import Notification from "../../../models/Notification.js";
import UserActivity, {
  ActivityTypeEnum,
} from "../../../models/UserActivity.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const params = z.object({
  userId: zObjectId,
});

type Params = z.infer<typeof params>;

export const removeFollowerValidation = validateData({
  params: params,
});

export async function removeFollower(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { userId } = req.params as unknown as Params;

    const followDoc = await Follow.findOne({
      user: userId,
      target: authUser._id,
    }).orFail(
      createError(
        dynamicMessage(ds.notFound, "Connection"),
        StatusCodes.NOT_FOUND,
      ),
    );

    await followDoc.deleteOne();

    const [deleteUserActivity, deleteNotification] = await Promise.all([
      UserActivity.deleteOne({
        userId: userId,
        resourceId: authUser._id,
        activityType: ActivityTypeEnum.Following,
        resourceType: ResourceTypeEnum.User,
      }),
      Notification.deleteOne({
        resources: {
          $elemMatch: { _id: followDoc._id, type: ResourceTypeEnum.Follow },
        },
      }),
    ]);

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

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}
