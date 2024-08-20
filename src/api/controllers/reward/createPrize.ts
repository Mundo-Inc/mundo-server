import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import Prize from "../../../models/prize.js";
import Upload from "../../../models/upload.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const body = z.object({
  title: z.string(),
  thumbnail: zObjectId,
  amount: z.number(),
  count: z.number().int().optional(),
});

type Body = z.infer<typeof body>;

export const createPrizeValidation = validateData({
  body: body,
});

// admin only
export async function createPrize(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { title, thumbnail, amount, count } = req.body as Body;

    const upload = await Upload.findById(thumbnail).orFail(
      createError(
        dynamicMessage(ds.notFound, "Uploaded media"),
        StatusCodes.NOT_FOUND,
      ),
    );

    const prize = await Prize.create({
      title,
      thumbnail: upload.src,
      amount,
      count,
    });

    await upload.deleteOne();

    res.status(StatusCodes.CREATED).json(createResponse(prize));
  } catch (error) {
    next(error);
  }
}
