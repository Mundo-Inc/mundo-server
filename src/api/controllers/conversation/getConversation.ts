import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import UserProjection from "../../../api/dto/user.js";
import Conversation from "../../../models/Conversation.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const params = z.object({
  id: zObjectId,
});

type Params = z.infer<typeof params>;

export const getConversationValidation = validateData({
  params: params,
});

export async function getConversation(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { id } = req.params as unknown as Params;

    const conversation = await Conversation.findOne({
      _id: id,
      participants: {
        $elemMatch: { user: authUser._id },
      },
    })
      .orFail(
        createError(
          dynamicMessage(ds.notFound, "Conversation"),
          StatusCodes.NOT_FOUND,
        ),
      )
      .populate({
        path: "participants.user",
        select: UserProjection.essentials,
      })
      .lean();

    res.status(StatusCodes.OK).json({ success: true, data: conversation });
  } catch (err) {
    next(err);
  }
}
