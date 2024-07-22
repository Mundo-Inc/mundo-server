import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import Mission from "../../../models/Mission.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const params = z.object({
  id: zObjectId,
});

type Params = z.infer<typeof params>;

export const deleteMissionValidation = validateData({
  params: params,
});

export async function deleteMission(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = req.params as unknown as Params;

    await Mission.deleteOne({ _id: id });

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (error) {
    next(error);
  }
}
