import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import { UserActivityManager } from "../../../api/services/UserActivityManager.js";
import Follow from "../../../models/Follow.js";
import FollowRequest from "../../../models/FollowRequest.js";
import User from "../../../models/User.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const params = z.object({
  id: zObjectId,
});

type Params = z.infer<typeof params>;

export const createUserConnectionValidation = validateData({
  params: params,
});

export async function createUserConnection(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { id } = req.params as unknown as Params;

    if (authUser._id.equals(id)) {
      throw createError("Lol", StatusCodes.FORBIDDEN);
    }

    // Check if the follow relationship already exists
    const existingFollow = await Follow.exists({
      user: authUser._id,
      target: id,
    });

    if (existingFollow) {
      throw createError(
        dynamicMessage(ds.alreadyExists, "Follow"),
        StatusCodes.CONFLICT,
      );
    }

    const targetUser = await User.findById(id).orFail(
      createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND),
    );

    if (targetUser.isPrivate) {
      const existingFollowRequest = await FollowRequest.exists({
        user: authUser._id,
        target: id,
      });

      if (existingFollowRequest) {
        throw createError(
          "You have already sent a follow request",
          StatusCodes.BAD_REQUEST,
        );
      }

      const request = await FollowRequest.create({
        user: authUser._id,
        target: id,
      });

      res.status(StatusCodes.ACCEPTED).json(createResponse(request));

      //TODO: Send Notification to Target that they have a follow request
    } else {
      // Create new follow relationship
      const follow = await Follow.create({
        user: authUser._id,
        target: id,
      });

      // Create following activity
      await UserActivityManager.createFollowActivity(authUser, id);

      res.status(StatusCodes.CREATED).json(createResponse(follow));
    }
  } catch (err) {
    next(err); // Pass any errors to the error handling middleware
  }
}
