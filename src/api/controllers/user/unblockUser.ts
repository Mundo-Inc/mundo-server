import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import Block from "../../../models/Block.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const params = z.object({
  id: zObjectId,
});

type Params = z.infer<typeof params>;

export const unblockUserValidation = validateData({
  params: params,
});

export async function unblockUser(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { id } = req.params as unknown as Params;

    const block = await Block.findOne({
      user: authUser._id,
      target: id,
    }).orFail(
      createError(
        dynamicMessage(ds.notFound, "Document"),
        StatusCodes.NOT_FOUND,
      ),
    );

    await block.deleteOne();

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (error) {
    next(error);
  }
}
