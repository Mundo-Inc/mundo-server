import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import UserProjection from "../../../api/dto/user.js";
import User from "../../../models/User.js";

export async function getConversations(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const conversations = await User.aggregate([
      {
        $match: {
          _id: authUser._id,
        },
      },
      {
        $lookup: {
          from: "conversations",
          localField: "conversations",
          foreignField: "_id",
          as: "conversations",
        },
      },
      {
        $unwind: "$conversations",
      },
      {
        $unwind: "$conversations.participants",
      },
      {
        $lookup: {
          from: "users",
          localField: "conversations.participants.user",
          foreignField: "_id",
          as: "conversations.participants.user",
          pipeline: [
            {
              $project: UserProjection.essentials,
            },
          ],
        },
      },
      {
        $addFields: {
          "conversations.participants.user": {
            $arrayElemAt: ["$conversations.participants.user", 0],
          },
        },
      },
      {
        $group: {
          _id: "$conversations._id",
          participants: { $push: "$conversations.participants" },
          friendlyName: { $first: "$conversations.friendlyName" },
          tags: { $first: "$conversations.tags" },
          createdBy: { $first: "$conversations.createdBy" },
          updatedAt: { $first: "$conversations.updatedAt" },
        },
      },
    ]);

    res.status(StatusCodes.OK).json({ success: true, data: conversations });
  } catch (err) {
    next(err);
  }
}
