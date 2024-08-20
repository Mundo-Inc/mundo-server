import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import Mission, { TaskTypeEnum } from "../../../models/mission.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData } from "../../../utilities/validation.js";

const body = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  icon: z.string(),
  task: z.object({
    type: z.nativeEnum(TaskTypeEnum),
    count: z.number(),
  }),
  rewardAmount: z.number().int(),
  startsAt: z
    .number()
    .int()
    .transform((value) => new Date(value)),
  expiresAt: z
    .number()
    .int()
    .transform((value) => new Date(value))
    .optional(),
});

type Body = z.infer<typeof body>;

export const createMissionValidation = validateData({
  body: body,
});

export async function createMission(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { title, subtitle, icon, task, rewardAmount, startsAt, expiresAt } =
      req.body as Body;

    const expireDate =
      expiresAt ?? new Date(startsAt.getTime() + 7 * 24 * 60 * 60 * 1000);

    const mission = await Mission.create({
      title,
      subtitle,
      icon,
      task,
      rewardAmount,
      startsAt,
      expiresAt: expireDate,
    });

    res.status(StatusCodes.CREATED).json(createResponse(mission));
  } catch (error) {
    next(error);
  }
}
