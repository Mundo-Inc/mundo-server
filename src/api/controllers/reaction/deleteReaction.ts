import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import logger from "@/api/services/logger/index.js";
import { ResourceTypeEnum } from "@/models/Enum/ResourceTypeEnum.js";
import Notification from "@/models/Notification.js";
import Reaction from "@/models/Reaction.js";
import UserActivity from "@/models/UserActivity.js";
import { dStrings as ds, dynamicMessage } from "@/strings.js";
import { createError } from "@/utilities/errorHandlers.js";
import { validateData, zObjectId } from "@/utilities/validation.js";

const params = z.object({
  id: zObjectId,
});

type Params = z.infer<typeof params>;

export const deleteReactionValidation = validateData({
  params: params,
});

export async function deleteReaction(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = req.user!;

    const { id } = req.params as unknown as Params;

    const reaction = await Reaction.findById(id).orFail(
      createError(
        dynamicMessage(ds.notFound, "Reaction"),
        StatusCodes.NOT_FOUND
      )
    );

    if (!reaction.user.equals(authUser._id)) {
      throw createError(
        "You are not authorized to perform this action",
        StatusCodes.FORBIDDEN
      );
    }

    await Reaction.deleteOne({ _id: id, user: authUser._id });
    await UserActivity.updateOne(
      { _id: reaction.target },
      { $inc: { "engagements.reactions": -1 } }
    );

    // remove all notifications related to the comment
    try {
      await Notification.deleteMany({
        resources: {
          $elemMatch: { type: ResourceTypeEnum.Reaction, _id: id },
        },
      });
    } catch (e) {
      logger.error(`Something happened during delete reaction`, { error: e });
      throw e;
    }

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}
