import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import Conversation from "../../../models/Conversation.js";
import User from "../../../models/User.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";
import client from "./client.js";

const params = z.object({
  id: z.string(),
});
const body = z.object({
  user: zObjectId,
});

type Params = z.infer<typeof params>;
type Body = z.infer<typeof body>;

export const removeUserFromGroupConversationValidation = validateData({
  params: params,
  body: body,
});

export async function removeUserFromGroupConversation(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = req.params as unknown as Params;
    const { user } = req.body as Body;

    //check if we are the creator of the channel

    // List all participants and find the one with the matching identity
    const participants = await client.conversations.v1
      .conversations(id)
      .participants.list();

    const participantToRemove = participants.find(
      (participant) => participant.identity === user.toString(),
    );

    if (!participantToRemove) {
      throw createError(
        "Participant not found in this conversation.",
        StatusCodes.NOT_FOUND,
      );
    }

    if (participants.length === 1) {
      // Remove the conversation if the user is the only participant
      await Promise.all([
        Conversation.deleteOne({ _id: id }),
        client.conversations.v1.conversations(id).remove({
          xTwilioWebhookEnabled: "true",
        }),
        User.updateOne({ _id: user }, { $pull: { conversations: id } }),
      ]);

      res.sendStatus(StatusCodes.NO_CONTENT);
    } else {
      await Promise.all([
        await client.conversations.v1
          .conversations(id)
          .participants(participantToRemove.sid)
          .remove(),
        User.updateOne({ _id: user }, { $pull: { conversations: id } }),
      ]);

      // Update the database to reflect participant removal
      const conversation = await Conversation.findById(id).orFail(
        createError(
          dynamicMessage(ds.notFound, "Conversation"),
          StatusCodes.NOT_FOUND,
        ),
      );

      conversation.participants = conversation.participants.filter(
        (p) => !p.user.equals(user),
      );

      await conversation.save();

      res.status(StatusCodes.OK).json({ success: true, data: conversation });
    }
  } catch (err) {
    next(err);
  }
}
