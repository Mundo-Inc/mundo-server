import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import { createCron } from "@/cronjobs/bots.js";
import Bot, { IBotTargetEnum, IBotTypeEnum } from "@/models/Bot.js";
import User from "@/models/User.js";
import { dStrings as ds, dynamicMessage } from "@/strings.js";
import { createError } from "@/utilities/errorHandlers.js";
import { validateData, zObjectId } from "@/utilities/validation.js";

const params = z.object({
  id: zObjectId,
});

const body = z.object({
  target: z.nativeEnum(IBotTargetEnum),
  type: z.nativeEnum(IBotTypeEnum),
  targetThresholdHours: z.number().optional(),
  interval: z.string(),
  reactions: z.array(z.string()).optional(),
  comments: z.array(z.string()).optional(),
});

type Params = z.infer<typeof params>;
type Body = z.infer<typeof body>;

export const createDutyValidation = validateData({
  params: params,
  body: body,
});

export async function createDuty(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    req.body as Body;
    const { id } = req.params as unknown as Params;
    const {
      targetThresholdHours,
      interval,
      reactions,
      comments,
      target,
      type,
    } = req.body as Body;

    const duty = await Bot.create({
      userId: id,
      target,
      type,
      targetThresholdHours,
      interval,
      reactions,
      comments,
    });

    const botUser = await User.findById(id).orFail(
      createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND)
    );

    createCron(duty._id.toString(), duty, botUser)?.start();

    res.status(StatusCodes.CREATED).json({
      sucess: true,
      data: duty,
    });
  } catch (err) {
    next(err);
  }
}
