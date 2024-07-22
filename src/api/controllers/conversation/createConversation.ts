import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import Conversation from "../../../models/Conversation.js";
import User from "../../../models/User.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";
import client from "./client.js";

const body = z.object({
  user: zObjectId,
});

type Body = z.infer<typeof body>;

export const createConversationValidation = validateData({
  body: body,
});

export async function createConversation(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { user } = req.body as Body;

    const [creatorUser, participant] = await Promise.all([
      User.findById(authUser._id).orFail(
        createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND),
      ),
      User.findById(user).orFail(
        createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND),
      ),
    ]);

    const alreadyExists = await Conversation.aggregate([
      {
        $match: {
          participants: {
            $all: [
              { $elemMatch: { user: user } },
              { $elemMatch: { user: authUser._id } },
            ],
          },
        },
      },
      {
        $addFields: {
          participantsCount: { $size: "$participants" },
        },
      },
      {
        $match: {
          participantsCount: 2,
        },
      },
      {
        $project: {
          _id: 1,
          friendlyName: 1,
        },
      },
    ]).then((conversations) => conversations[0]);

    if (alreadyExists) {
      res.status(StatusCodes.OK).json(createResponse(alreadyExists));
      return;
    }

    const friendlyName = authUser._id.toString() + "_" + user;

    const twilioConversation =
      await client.conversations.v1.conversations.create({
        friendlyName: friendlyName,
        xTwilioWebhookEnabled: "true",
      });

    // Add participants to the Twilio conversation

    const [creatorUserParticipant, userParticipant] = await Promise.all([
      client.conversations.v1
        .conversations(twilioConversation.sid)
        .participants.create({
          identity: authUser._id.toString(),
          attributes: JSON.stringify({
            name: creatorUser.name,
          }),
        }),
      client.conversations.v1
        .conversations(twilioConversation.sid)
        .participants.create({
          identity: user.toString(),
          attributes: JSON.stringify({
            name: participant.name,
          }),
        }),
    ]);

    const conversation = await Conversation.create({
      _id: twilioConversation.sid, // Use the SID as the unique ID
      friendlyName: friendlyName, // Assuming friendlyName is defined elsewhere
      participants: [
        {
          user: authUser._id,
          role: "participant",
          chat: creatorUserParticipant.sid,
        },
        {
          user: user,
          role: "participant",
          chat: userParticipant.sid,
        },
      ],
      createdBy: authUser._id,
      isClosed: false,
    });

    await Promise.all([
      User.updateOne(
        { _id: user },
        { $push: { conversations: conversation._id } },
      ),
      User.updateOne(
        { _id: authUser._id },
        { $push: { conversations: conversation._id } },
      ),
    ]);

    res.status(StatusCodes.CREATED).json(createResponse(conversation));
  } catch (err) {
    next(err);
  }
}
