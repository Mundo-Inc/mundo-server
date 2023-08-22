import type { NextFunction, Request, Response } from "express";
import { param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";

import Category from "../../models/Category";
import { handleInputErrors } from "../../utilities/errorHandlers";
import validate from "./validators";

export const getCategoriesValidation: ValidationChain[] = [
  validate.q(query("q").optional()),
];
export async function getCategories(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { q } = req.query;

    const query: {
      [key: string]: any;
    } = {
      isActive: true,
    };

    if (q) {
      query["$or"] = [
        { _id: { $regex: q as string, $options: "i" } },
        { title: { $regex: q as string, $options: "i" } },
      ];
    }

    const categories = await Category.find(query, {
      _id: 1,
      title: 1,
    }).limit(5);

    res.status(StatusCodes.OK).json(categories);
  } catch (err) {
    next(err);
  }
}

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

    const latestVersion = "0.11.0";
    const minOperationalVersion = "0.11.0";
    const isLatest = version === latestVersion;

    const compare = compareVersion(version, minOperationalVersion);

    const isOperational = compare >= 0;

    return res.status(StatusCodes.OK).json({
      isLatest,
      latestVersion,
      isOperational,
      minOperationalVersion,
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
