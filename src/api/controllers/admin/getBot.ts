import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import Bot from "@/models/Bot.js";
import User from "@/models/User.js";
import { dStrings as ds, dynamicMessage } from "@/strings.js";
import { createError } from "@/utilities/errorHandlers.js";
import { validateData, zObjectId } from "@/utilities/validation.js";

const params = z.object({
  id: zObjectId,
});

type Params = z.infer<typeof params>;

export const getBotValidation = validateData({
  params: params,
});

export async function getBot(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as unknown as Params;

    const bot = await User.findById(id).orFail(
      createError(dynamicMessage(ds.notFound, "Bot"), StatusCodes.NOT_FOUND)
    );

    const duties = await Bot.find({
      userId: id,
    });

    res.status(StatusCodes.OK).json({
      sucess: true,
      data: { bot, duties },
    });
  } catch (err) {
    next(err);
  }
}
