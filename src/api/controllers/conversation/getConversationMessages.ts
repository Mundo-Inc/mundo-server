import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import Conversation from "../../../models/conversation/conversation.js";
import ConversationMessage from "../../../models/conversation/conversationMessage.js";
import { dStrings, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";
import { UserProjection } from "../../dto/user.js";

const params = z.object({
  conversationId: zObjectId,
});

const query = z.object({
  lastMessage: zObjectId.optional(),
  limit: z
    .string()
    .transform((v) => parseInt(v))
    .refine((v) => v >= 1 && v <= 200)
    .optional()
    .default("100"),
});

export const getConversationMessagesValidation = validateData({
  params: params,
  query: query,
});

type Query = z.infer<typeof query>;
type Params = z.infer<typeof params>;

export async function getConversationMessages(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { conversationId } = req.params as unknown as Params;
    const { lastMessage, limit } = req.query as unknown as Query;

    const conversation = await Conversation.findById(conversationId)
      .orFail(
        createError(
          dynamicMessage(dStrings.notFound, "Conversation"),
          StatusCodes.NOT_FOUND,
        ),
      )
      .lean();

    if (!conversation.participants.some((p) => p.user.equals(authUser._id))) {
      throw createError(
        "You are not a participant of this conversation",
        StatusCodes.FORBIDDEN,
      );
    }

    const result = await ConversationMessage.aggregate([
      {
        $match: {
          conversation: conversationId,
          ...(lastMessage ? { _id: { $lt: lastMessage } } : {}),
        },
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
      {
        $limit: limit,
      },
      {
        $lookup: {
          from: "users",
          localField: "sender",
          foreignField: "_id",
          as: "sender",
          pipeline: [
            {
              $project: UserProjection.essentials,
            },
          ],
        },
      },
      {
        $project: {
          _id: 1,
          conversation: 1,
          sender: { $arrayElemAt: ["$sender", 0] },
          content: 1,
          index: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ]);

    res.status(StatusCodes.OK).json(createResponse(result));
  } catch (err) {
    next(err);
  }
}
