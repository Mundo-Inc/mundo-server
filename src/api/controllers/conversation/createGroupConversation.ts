import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import Conversation from "../../../models/Conversation.js";
import User from "../../../models/User.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import {
  validateData,
  zUniqueObjectIdArray,
} from "../../../utilities/validation.js";
import client from "./client.js";

const body = z.object({
  users: zUniqueObjectIdArray.refine((users) => users.length >= 2),
  name: z.string().optional(),
});

type Body = z.infer<typeof body>;

export const createGroupConversationValidation = validateData({
  body: body,
});

export async function createGroupConversation(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { users, name } = req.body as Body;

    const authUser = req.user!;

    const friendlyName = name || "Group Chat";

    const twilioConversation =
      await client.conversations.v1.conversations.create({
        friendlyName: friendlyName,
      });

    const creatorUser = await User.findById(authUser._id)
      .orFail(
        createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND),
      )
      .lean();

    const participantsUsers = await User.find({
      _id: { $in: users },
    })
      .select<{ name: string }>("name")
      .lean();

    // Add participants to the Twilio conversation
    const creatorUserParticipant = await client.conversations.v1
      .conversations(twilioConversation.sid)
      .participants.create({
        identity: authUser._id.toString(),
        attributes: JSON.stringify({
          name: creatorUser.name,
        }),
      });

    const twilioParticipants = [
      {
        user: authUser._id,
        role: "participant",
        chat: creatorUserParticipant.sid,
      },
    ];

    for (const participant of participantsUsers) {
      const userParticipant = await client.conversations.v1
        .conversations(twilioConversation.sid)
        .participants.create({
          identity: participant._id.toString(),
          attributes: JSON.stringify({
            name: participant.name,
          }),
        });

      twilioParticipants.push({
        user: participant._id,
        role: "participant",
        chat: userParticipant.sid,
      });
    }

    const conversation = await Conversation.create({
      _id: twilioConversation.sid, // Use the SID as the unique ID
      friendlyName: friendlyName, // Assuming friendlyName is defined elsewhere
      participants: twilioParticipants,
      createdBy: authUser._id,
      isClosed: false,
    });

    for (const participant of participantsUsers) {
      await User.updateOne(
        { _id: participant._id },
        { $push: { conversations: conversation._id } },
      );
    }

    await User.updateOne(
      { _id: authUser._id },
      { $push: { conversations: conversation._id } },
    );

    res.status(StatusCodes.CREATED).json({ success: true, data: conversation });
  } catch (err) {
    next(err);
  }
}
