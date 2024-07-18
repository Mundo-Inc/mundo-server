import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import DeletionService from "@/api/services/DeletionService.js";
import CheckIn from "@/models/CheckIn.js";
import type { FlagAdminAction } from "@/models/Flag.js";
import Flag from "@/models/Flag.js";
import Homemade from "@/models/Homemade.js";
import Review from "@/models/Review.js";
import { dStrings as ds, dynamicMessage } from "@/strings.js";
import { createError } from "@/utilities/errorHandlers.js";
import { validateData, zObjectId } from "@/utilities/validation.js";

const params = z.object({
  id: zObjectId,
});

const body = z.object({
  action: z.enum(["DELETE", "IGNORE"]),
  note: z.string().optional(),
});

type Params = z.infer<typeof params>;
type Body = z.infer<typeof body>;

export const resolveFlagValidation = validateData({
  params: params,
  body: body,
});

export async function resolveFlag(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = req.user!;

    const { id } = req.params as unknown as Params;
    const { action, note } = req.body as Body;

    const flag = await Flag.findById(id)
      .orFail(
        createError(dynamicMessage(ds.notFound, "Flag"), StatusCodes.NOT_FOUND)
      )
      .populate("target");

    if (flag.adminAction) {
      throw createError("Flag already resolved", StatusCodes.BAD_REQUEST);
    }

    if (action === "DELETE") {
      if (flag.targetType === "Comment") {
        await DeletionService.deleteComment(flag.target);
      } else if (flag.targetType === "Review") {
        const review = await Review.findById(flag.target);
        if (review) await review.deleteOne();
      } else if (flag.targetType === "CheckIn") {
        const checkIn = await CheckIn.findById(flag.target);
        if (checkIn) await checkIn.deleteOne();
      } else if (flag.targetType === "Homemade") {
        const homemade = await Homemade.findById(flag.target);
        if (homemade) await homemade.deleteOne();
      }
    }

    const adminAction: FlagAdminAction = {
      type: action,
      note: note,
      admin: authUser._id,
      createdAt: new Date(),
    };

    // save the action
    flag.adminAction = adminAction;

    await flag.save();

    // If the flagaction was delete we need to resolve all the flags for that target.
    if (action === "DELETE") {
      const relatedFlags = await Flag.find({
        targetType: flag.targetType,
        target: flag.target,
      });
      for (const f of relatedFlags) {
        f.adminAction = adminAction;
        await f.save();
      }
    }

    res.status(StatusCodes.OK).json({ success: true, data: flag });
  } catch (err) {
    next(err);
  }
}
