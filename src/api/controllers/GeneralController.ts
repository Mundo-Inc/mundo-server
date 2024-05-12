import type { NextFunction, Request, Response } from "express";
import { param, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";

import AppSetting from "../../models/AppSetting";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";

export const getVersionInfoValidation: ValidationChain[] = [
  param("version").isString().notEmpty(),
];
export async function getVersionInfo(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const { version } = req.params;

    const [latestAppVersion, minOperationalVersion] = await Promise.all([
      AppSetting.findOne({ key: "latestAppVersion" })
        .orFail(createError("App settings not found", StatusCodes.NOT_FOUND))
        .lean(),
      AppSetting.findOne({ key: "minOperationalVersion" })
        .orFail(createError("App settings not found", StatusCodes.NOT_FOUND))
        .lean(),
    ]);

    const isLatest = version === latestAppVersion.value;
    const compare = compareVersion(version, minOperationalVersion.value);

    const isOperational = compare >= 0;

    res.status(StatusCodes.OK).json({
      isLatest,
      latestAppVersion: latestAppVersion.value,
      isOperational,
      minOperationalVersion: minOperationalVersion.value,
      message: isOperational ? "" : "Please update to the latest version",
    });
  } catch (err) {
    next(err);
  }
}

function compareVersion(v1: string, v2: string) {
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);

  const maxLength = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < maxLength; i++) {
    const part1 = parts1[i] || 0; // default to 0 if no part exists
    const part2 = parts2[i] || 0; // default to 0 if no part exists

    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }

  return 0; // versions are equal
}
