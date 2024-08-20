import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import { UserActivityManager } from "../../../api/services/userActivityManager.js";
import { ResourceTypeEnum } from "../../../models/enum/resourceTypeEnum.js";
import Follow from "../../../models/Follow.js";
import FollowRequest from "../../../models/FollowRequest.js";
import Notification, {
  NotificationTypeEnum,
} from "../../../models/Notification.js";
import type { IUser } from "../../../models/user/user.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const params = z.object({
  requestId: zObjectId,
});

type Params = z.infer<typeof params>;

export const acceptFollowRequestValidation = validateData({
  params: params,
});

export async function acceptFollowRequest(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { requestId } = req.params as unknown as Params;

    const followRequest = await FollowRequest.findOne({
      _id: requestId,
      target: authUser._id,
    })
      .orFail(
        createError(
          dynamicMessage(ds.notFound, "Follow Request"),
          StatusCodes.NOT_FOUND,
        ),
      )
      .populate<{
        user: Pick<IUser, "_id" | "isPrivate">;
      }>({
        path: "user",
        select: ["_id", "isPrivate"],
      });

    const follow = await Follow.create({
      user: followRequest.user,
      target: followRequest.target,
    });

    await Promise.all([
      UserActivityManager.createFollowActivity(
        followRequest.user,
        followRequest.target,
      ),
      followRequest.deleteOne(),
    ]);

    await Notification.create({
      user: followRequest.user._id,
      type: NotificationTypeEnum.FollowRequestAccepted,
      resources: [
        {
          _id: follow._id,
          type: ResourceTypeEnum.Follow,
          date: follow.createdAt,
        },
      ],
      importance: 2,
    });

    res.status(StatusCodes.CREATED).json(createResponse(follow));
  } catch (error) {
    next(error);
  }
}
