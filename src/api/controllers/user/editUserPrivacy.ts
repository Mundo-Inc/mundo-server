import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import Follow from "../../../models/Follow.js";
import FollowRequest from "../../../models/FollowRequest.js";
import User from "../../../models/User.js";
import UserActivity from "../../../models/UserActivity.js";
import strings, { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const editUserPrivacyParams = z.object({
  id: zObjectId,
});

const editUserPrivacyBody = z.object({
  isPrivate: z.boolean(),
});

type EditUserPrivacyParams = z.infer<typeof editUserPrivacyParams>;
type EditUserPrivacyBody = z.infer<typeof editUserPrivacyBody>;

export const editUserPrivacyValidation = validateData({
  params: editUserPrivacyParams,
  body: editUserPrivacyBody,
});

export async function editUserPrivacy(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { id } = req.params as unknown as EditUserPrivacyParams;
    const { isPrivate } = req.body as EditUserPrivacyBody;

    if (!authUser._id.equals(id) && authUser.role !== "admin") {
      throw createError(
        strings.authorization.accessDenied,
        StatusCodes.FORBIDDEN,
      );
    }

    const user = await User.findById(id).orFail(
      createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND),
    );

    if (user.isPrivate && !isPrivate) {
      const followReqs = await FollowRequest.find({
        target: authUser._id,
      });

      for (const followReq of followReqs) {
        await Follow.create({
          user: followReq.user,
          target: followReq.target,
        });
      }
    }

    user.isPrivate = isPrivate;
    await user.save();

    // Change all UserActivity isAccountPrivate to isPrivate
    await UserActivity.updateMany(
      { userId: user._id },
      { isAccountPrivate: isPrivate },
    );

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}
