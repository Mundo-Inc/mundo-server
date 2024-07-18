import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import Review from "@/models/Review.js";
import strings, { dStrings as ds, dynamicMessage } from "@/strings.js";
import { createError } from "@/utilities/errorHandlers.js";
import { validateData, zObjectId } from "@/utilities/validation.js";

const params = z.object({
  reviewId: zObjectId,
});

type Params = z.infer<typeof params>;

export const removeReviewValidation = validateData({
  params: params,
});

export async function removeReview(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = req.user!;

    const { reviewId } = req.params as unknown as Params;

    const review = await Review.findById(reviewId).orFail(
      createError(dynamicMessage(ds.notFound, "Review"), StatusCodes.NOT_FOUND)
    );

    if (!authUser._id.equals(review.writer)) {
      throw createError(strings.authorization.otherUser, StatusCodes.FORBIDDEN);
    }

    await review.deleteOne();

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}
