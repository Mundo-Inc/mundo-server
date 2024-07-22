import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import AppSetting from "../../../models/AppSetting.js";
import { validateData } from "../../../utilities/validation.js";

const body = z.object({
  key: z.enum(["latestAppVersion", "minOperationalVersion"]),
  value: z.string(),
});

type Body = z.infer<typeof body>;

export const updateSettingsValidation = validateData({
  body: body,
});

export async function updateSettings(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { key, value } = req.body as Body;

    await AppSetting.findOneAndUpdate({ key }, { value }, { new: true });

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}
