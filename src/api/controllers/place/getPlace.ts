import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import { createResponse } from "../../../utilities/response.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";
import { getDetailedPlace } from "./helpers.js";

const params = z.object({
  placeId: zObjectId,
});

type Params = z.infer<typeof params>;

export const getPlaceValidation = validateData({
  params: params,
});

export async function getPlace(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { placeId } = req.params as unknown as Params;

    const response = await getDetailedPlace(placeId);

    res.status(StatusCodes.OK).json(createResponse(response));
  } catch (err) {
    next(err);
  }
}
