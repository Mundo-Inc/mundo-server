import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import Bot from "../../../models/bot.js";
import User from "../../../models/user/user.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

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
      createError(dynamicMessage(ds.notFound, "Bot"), StatusCodes.NOT_FOUND),
    );

    const duties = await Bot.find({
      userId: id,
    });

    res.status(StatusCodes.OK).json(createResponse({ bot, duties }));
  } catch (err) {
    next(err);
  }
}
