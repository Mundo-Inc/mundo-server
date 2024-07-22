import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import CheckIn from "../../../models/CheckIn.js";
import strings, { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const params = z.object({
  id: zObjectId,
});

type Params = z.infer<typeof params>;

export const deleteCheckInValidation = validateData({
  params: params,
});

export async function deleteCheckIn(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { id } = req.params as unknown as Params;

    const checkin = await CheckIn.findById(id).orFail(
      createError(
        dynamicMessage(ds.notFound, "Check-in"),
        StatusCodes.NOT_FOUND,
      ),
    );

    if (!authUser._id.equals(checkin.user) && authUser.role !== "admin") {
      throw createError(strings.authorization.otherUser, StatusCodes.FORBIDDEN);
    }

    await checkin.deleteOne();

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}
