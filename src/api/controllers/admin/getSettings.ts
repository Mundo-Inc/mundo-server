import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import AppSetting from "../../../models/appSetting.js";
import { createResponse } from "../../../utilities/response.js";

export async function getSettings(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const settings = await AppSetting.find({}).lean();

    const data: Record<string, any> = {};

    for (const setting of settings) {
      data[setting.key] = setting.value;
    }

    res.status(StatusCodes.OK).json(createResponse(data));
  } catch (err) {
    next(err);
  }
}
