import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import Conversation from "../../../models/conversation/conversation.js";
import { dStrings, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";
import { UserProjection } from "../../dto/user.js";

const params = z.object({
  conversationId: zObjectId,
});

export const getConversationValidation = validateData({
  params: params,
});

type Params = z.infer<typeof params>;

export async function getConversation(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { conversationId } = req.params as unknown as Params;

    const result = await Conversation.aggregate([
      {
        $match: {
          _id: conversationId,
        },
      },
      {
        $unwind: "$participants",
      },
      {
        $lookup: {
          from: "users",
          localField: "participants.user",
          foreignField: "_id",
          as: "participants.user",
          pipeline: [
            {
              $project: UserProjection.essentials,
            },
          ],
        },
      },
      {
        $unwind: "$participants.user",
      },
      {
        $group: {
          _id: "$_id",
          participants: {
            $push: {
              user: "$participants.user",
              read: "$participants.read",
            },
          },
          title: { $first: "$title" },
          isGroup: { $first: "$isGroup" },
          lastActivity: { $first: "$lastActivity" },
          lastMessageIndex: { $first: "$lastMessageIndex" },
          createdAt: { $first: "$createdAt" },
          updatedAt: { $first: "$updatedAt" },
        },
      },
      {
        $lookup: {
          from: "conversationmessages",
          localField: "_id",
          foreignField: "conversation",
          as: "lastMessage",
          pipeline: [
            {
              $sort: {
                createdAt: -1,
              },
            },
            {
              $limit: 1,
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
              $unwind: "$sender",
            },
          ],
        },
      },
      {
        $addFields: {
          lastMessage: {
            $arrayElemAt: ["$lastMessage", 0],
          },
        },
      },
      {
        $project: {
          _id: 1,
          participants: 1,
          title: 1,
          isGroup: 1,
          lastActivity: 1,
          lastMessage: 1,
          lastMessageIndex: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ]).then((result) => result[0]);

    if (!result) {
      throw createError(
        dynamicMessage(dStrings.notFound, "Conversation"),
        StatusCodes.NOT_FOUND,
      );
    }

    res.status(StatusCodes.OK).json(createResponse(result));
  } catch (err) {
    next(err);
  }
}
