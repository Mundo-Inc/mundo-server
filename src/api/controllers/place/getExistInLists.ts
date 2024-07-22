import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import List from "../../../models/List.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const params = z.object({
  placeId: zObjectId,
});

type Params = z.infer<typeof params>;

export const getExistInListsValidation = validateData({
  params: params,
});

export async function getExistInLists(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { placeId } = req.params as unknown as Params;

    const lists = await List.find({
      "collaborators.user": authUser._id,
      "places.place": placeId,
    })
      .select("_id")
      .lean();

    const result = lists.map((obj) => obj._id);

    res.status(StatusCodes.OK).json(createResponse(result));
  } catch (error) {
    next(error);
  }
}
