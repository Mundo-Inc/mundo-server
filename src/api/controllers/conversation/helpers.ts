import { StatusCodes } from "http-status-codes";
import type { Types } from "mongoose";

import logger from "../../../api/services/logger/index.js";
import Conversation from "../../../models/Conversation.js";
import User from "../../../models/User.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import client from "./client.js";

export async function sendAttributtedMessage(
  by: Types.ObjectId,
  to: Types.ObjectId,
  message: string,
  attributes: object,
) {
  const [byUser, toUser] = await Promise.all([
    User.findById(by).select<{ name: string }>("name").lean(),
    User.findById(to).select<{ name: string }>("name").lean(),
  ]);

  if (!byUser || !toUser) {
    throw createError(
      dynamicMessage(ds.notFound, "User"),
      StatusCodes.NOT_FOUND,
    );
  }

  const alreadyExists = await Conversation.aggregate([
    {
      $match: {
        participants: {
          $all: [{ $elemMatch: { user: by } }, { $elemMatch: { user: to } }],
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
        participants: 1,
      },
    },
  ]).then((conversations) => conversations[conversations.length - 1]);

  let sent = false;
  if (alreadyExists) {
    const participants = await client.conversations.v1
      .conversations(alreadyExists._id)
      .participants.list();

    if (participants.length !== 2) {
      throw createError(
        "Participants count is not equal to 2",
        StatusCodes.BAD_REQUEST,
      );
    }

    if (
      !participants.find((p) => p.identity === by.toString()) ||
      !participants.find((p) => p.identity === to.toString())
    ) {
      sent = false;
      logger.error(
        `Participant ${by} or ${to} found in the conversation ${alreadyExists._id} but data did not match`,
      );
    } else {
      await client.conversations.v1
        .conversations(alreadyExists._id)
        .messages.create({
          author: by.toString(),
          body: message,
          attributes: JSON.stringify(attributes),
        });
      sent = true;
    }
  } else {
    // Create a new conversation
    const friendlyName = by + "_" + to;

    const twilioConversation =
      await client.conversations.v1.conversations.create({
        friendlyName: friendlyName,
      });

    // Add participants to the Twilio conversation

    const [creatorUserParticipant, userParticipant] = await Promise.all([
      client.conversations.v1
        .conversations(twilioConversation.sid)
        .participants.create({
          identity: byUser._id.toString(),
          attributes: JSON.stringify({
            name: byUser.name,
          }),
        }),
      client.conversations.v1
        .conversations(twilioConversation.sid)
        .participants.create({
          identity: toUser._id.toString(),
          attributes: JSON.stringify({
            name: toUser.name,
          }),
        }),
    ]);

    const conversation = await Conversation.create({
      _id: twilioConversation.sid, // Use the SID as the unique ID
      friendlyName: friendlyName, // Assuming friendlyName is defined elsewhere
      participants: [
        {
          user: byUser._id,
          role: "participant",
          chat: creatorUserParticipant.sid,
        },
        {
          user: toUser._id,
          role: "participant",
          chat: userParticipant.sid,
        },
      ],
      createdBy: byUser._id,
      isClosed: false,
    });

    await Promise.all([
      User.updateOne(
        { _id: byUser._id },
        { $push: { conversations: conversation._id } },
      ),
      User.updateOne(
        { _id: toUser._id },
        { $push: { conversations: conversation._id } },
      ),
    ]);

    await client.conversations.v1
      .conversations(twilioConversation.sid)
      .messages.create({
        author: by.toString(),
        body: message,
        attributes: JSON.stringify(attributes),
      });
    sent = true;
  }

  if (!sent) {
    logger.error(
      `Failed to send message from ${by.toString()} to ${to.toString()} with message ${message}`,
    );
  }
}
