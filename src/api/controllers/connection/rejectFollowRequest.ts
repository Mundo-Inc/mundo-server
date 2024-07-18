import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import FollowRequest from "@/models/FollowRequest.js";
import { dStrings as ds, dynamicMessage } from "@/strings.js";
import { createError } from "@/utilities/errorHandlers.js";
import { validateData, zObjectId } from "@/utilities/validation.js";

const params = z.object({
  requestId: zObjectId,
});

type Params = z.infer<typeof params>;

export const rejectFollowRequestValidation = validateData({
  params: params,
});

export async function rejectFollowRequest(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = req.user!;

    const { requestId } = req.params as unknown as Params;

    const followRequest = await FollowRequest.findOne({
      _id: requestId,
      target: authUser._id,
    }).orFail(
      createError(
        dynamicMessage(ds.notFound, "Follow Request"),
        StatusCodes.NOT_FOUND
      )
    );

    await followRequest.deleteOne();

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (error) {
    next(error);
  }
}
