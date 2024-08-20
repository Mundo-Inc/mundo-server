import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import semver from "semver";
import { z } from "zod";

import AppSetting from "../../../models/appSetting.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { ResponseStatusEnum } from "../../../utilities/response.js";
import { validateData } from "../../../utilities/validation.js";

const params = z.object({
  version: z.string().min(1).max(20),
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
    const { version } = req.params as unknown as Params;

    const [latestAppVersion, minOperationalVersion] = await Promise.all([
      AppSetting.findOne({ key: "latestAppVersion" })
        .orFail(createError("App settings not found", StatusCodes.NOT_FOUND))
        .lean(),
      AppSetting.findOne({ key: "minOperationalVersion" })
        .orFail(createError("App settings not found", StatusCodes.NOT_FOUND))
        .lean(),
    ]);

    const isLatest = semver.eq(version, latestAppVersion.value);
    const isOperational = semver.gte(version, minOperationalVersion.value);

    res.status(StatusCodes.OK).json({
      isLatest,
      latestAppVersion: latestAppVersion.value,
      isOperational,
      minOperationalVersion: minOperationalVersion.value,
      message: isOperational ? "" : "Please update to the latest version",

      status: ResponseStatusEnum.Success,
      data: {
        isLatest,
        latestAppVersion: latestAppVersion.value,
        isOperational,
        minOperationalVersion: minOperationalVersion.value,
        message: isOperational ? "" : "Please update to the latest version",
      },
    });
  } catch (err) {
    next(err);
  }
}
