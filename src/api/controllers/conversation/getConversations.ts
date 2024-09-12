import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import Conversation from "../../../models/conversation/conversation.js";
import { getPaginationFromQuery } from "../../../utilities/pagination.js";
import { createResponse } from "../../../utilities/response.js";
import {
  validateData,
  zPaginationSpread,
} from "../../../utilities/validation.js";
import { UserProjection } from "../../dto/user.js";

const query = z.object(zPaginationSpread);

export const getConversationsValidation = validateData({
  query: query,
});

export async function getConversations(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { page, limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 100,
      maxLimit: 200,
    });

    const result = await Conversation.aggregate([
      {
        $match: {
          participants: {
            $elemMatch: {
              user: authUser._id,
            },
          },
        },
      },
      {
        $facet: {
          conversations: [
            {
              $sort: {
                lastActivity: -1,
              },
            },
            {
              $skip: skip,
            },
            {
              $limit: limit,
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
          ],
          total: [
            {
              $count: "total",
            },
          ],
        },
      },
      {
        $project: {
          conversations: 1,
          total: { $arrayElemAt: ["$total.total", 0] },
        },
      },
    ]).then((result) => result[0]);

    res.status(StatusCodes.OK).json(
      createResponse(result.conversations, {
        totalCount: result.total ?? 0,
        page,
        limit,
      }),
    );
  } catch (err) {
    next(err);
  }
}
