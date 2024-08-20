import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import { getResourceInfo } from "../../../api/services/feed.service.js";
import Comment from "../../../models/comment.js";
import UserActivity from "../../../models/userActivity.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { getConnectionStatus } from "../../../utilities/connections.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";
import { getCommentsOfActivity, getReactionsOfActivity } from "./helpers.js";

const params = z.object({
  id: zObjectId,
});

type Params = z.infer<typeof params>;

export const getActivityValidation = validateData({
  params: params,
});

export async function getActivity(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { id } = req.params as unknown as Params;

    const activity = await UserActivity.findById(id).orFail(
      createError(
        "Either the activity does not exist or you do not have permission to view it",
        StatusCodes.NOT_FOUND,
      ),
    );

    const [resourceInfo, placeInfo, userInfo] = await getResourceInfo(
      activity,
      authUser._id,
    );

    if (!resourceInfo) {
      throw createError(
        dynamicMessage(ds.notFound, "Resource"),
        StatusCodes.NOT_FOUND,
      );
    }

    const [reactions, comments, commentsCount, connectionStatus] =
      await Promise.all([
        getReactionsOfActivity(activity._id, authUser._id),
        getCommentsOfActivity(activity._id, authUser._id),
        Comment.countDocuments({
          userActivity: activity._id,
        }),
        getConnectionStatus(authUser._id, id),
      ]);

    userInfo.connectionStatus = connectionStatus;

    res.status(StatusCodes.OK).json(
      createResponse({
        _id: activity._id,
        user: userInfo,
        place: placeInfo,
        activityType: activity.activityType,
        resourceType: activity.resourceType,
        resource: resourceInfo,
        privacyType: "PUBLIC", // TODO: remove on next release
        resourcePrivacy: activity.resourcePrivacy,
        isAccountPrivate: activity.isAccountPrivate,
        createdAt: activity.createdAt,
        updatedAt: activity.updatedAt,
        reactions: reactions[0],
        comments: comments,
        commentsCount,
      }),
    );
  } catch (err) {
    next(err);
  }
}
