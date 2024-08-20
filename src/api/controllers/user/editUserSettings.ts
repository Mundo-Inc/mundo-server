import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import User from "../../../models/user/user.js";
import strings, { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const edutUserSettingsParams = z.object({
  id: zObjectId,
});

const editUserSettingsBody = z.object({
  action: z.enum(["deviceToken"]),
  token: z.string().optional(),
  apnToken: z.string().optional(),
  fcmToken: z.string().optional(),
  platform: z.string().optional(),
});

type EditUserSettingsParams = z.infer<typeof edutUserSettingsParams>;
type EditUserSettingsBody = z.infer<typeof editUserSettingsBody>;

export const editUserSettingsValidation = validateData({
  params: edutUserSettingsParams,
  body: editUserSettingsBody,
});

export async function editUserSettings(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { id } = req.params as unknown as EditUserSettingsParams;
    const { action, token, apnToken, fcmToken, platform } =
      req.body as EditUserSettingsBody;

    if (!authUser._id.equals(id) && authUser.role !== "admin") {
      throw createError(
        strings.authorization.accessDenied,
        StatusCodes.FORBIDDEN,
      );
    }

    if (action === "deviceToken") {
      if (!token && !apnToken && !fcmToken) {
        throw createError(
          strings.validations.missRequiredFields,
          StatusCodes.BAD_REQUEST,
        );
      }

      const newToken = apnToken || token;
      if ((!token && !newToken && !fcmToken) || !platform) {
        throw createError(
          strings.validations.missRequiredFields,
          StatusCodes.BAD_REQUEST,
        );
      }

      const user = await User.findById(id).orFail(
        createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND),
      );

      const found = user.devices.find(
        (device) =>
          device.apnToken === newToken || device.fcmToken === fcmToken,
      );
      if (found) {
        if (found.fcmToken !== fcmToken) {
          found.fcmToken = fcmToken;
          await user.save();
        } else if (found.apnToken !== newToken) {
          found.apnToken = newToken;
          await user.save();
        }
      } else {
        user.devices.push({ apnToken: newToken, fcmToken, platform });
        await user.save();
      }
    }

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}
