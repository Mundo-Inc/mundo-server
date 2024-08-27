import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import semver from "semver";
import { z } from "zod";

import AppSetting, { type IAppSetting } from "../../../models/appSetting.js";
import User from "../../../models/user/user.js";
import { dStrings, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData } from "../../../utilities/validation.js";

const params = z.object({
  version: z
    .string()
    .min(1)
    .max(20)
    .transform((value) => decodeURIComponent(value)),
});

type Params = z.infer<typeof params>;

export const getVersionInfoValidation = validateData({
  params: params,
});

export async function getVersionInfo(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user;

    const { version } = req.params as unknown as Params;

    const keys = ["latestAppVersion", "minOperationalVersion"];
    const settings = await AppSetting.find({ key: { $in: keys } })
      .select<Pick<IAppSetting, "value" | "key">>({ value: 1, key: 1 })
      .lean();

    const settingsMap = settings.reduce(
      (
        acc: {
          [key: string]: string;
        },
        setting,
      ) => {
        acc[setting.key] = setting.value;
        return acc;
      },
      {},
    );

    const { latestAppVersion, minOperationalVersion } = settingsMap;

    if (!latestAppVersion || !minOperationalVersion) {
      throw createError("Missing app settings", StatusCodes.NOT_FOUND);
    }

    if (!latestAppVersion || !minOperationalVersion) {
      throw createError("App settings not found", StatusCodes.NOT_FOUND);
    }

    const isLatest = semver.eq(version, latestAppVersion);
    const isOperational = semver.gte(version, minOperationalVersion);

    res.status(StatusCodes.OK).json(
      createResponse({
        isLatest,
        latestAppVersion: latestAppVersion,
        isOperational,
        minOperationalVersion: minOperationalVersion,
        message: isOperational ? "" : "Please update to the latest version",
      }),
    );

    if (authUser) {
      const user = await User.findById(authUser._id).orFail(
        createError(
          dynamicMessage(dStrings.notFound, "User"),
          StatusCodes.NOT_FOUND,
        ),
      );

      const now = new Date();

      user.appUsage.version = version;

      // Reset streak start date if the user has been inactive for more than 36 hours
      if (
        user.appUsage.lastOpenedAt.getTime() <
        now.getTime() - 1000 * 60 * 60 * 36
      ) {
        user.appUsage.streakStartDate = now;
      }

      user.appUsage.lastOpenedAt = now;

      await user.save();
    }
  } catch (err) {
    next(err);
  }
}
