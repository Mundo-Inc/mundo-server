import type { NextFunction, Request, Response } from "express";
import { body, param, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";
import twilio, { Twilio } from "twilio";

import Conversation, { type IConversation } from "../../models/Conversation";
import User from "../../models/User";
import { dStrings, dynamicMessage } from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import UserProjection from "../dto/user";
import logger from "../services/logger";

const AccessToken = twilio.jwt.AccessToken;
const ChatGrant = AccessToken.ChatGrant;

// Twilio setup
const accountSid = process.env.TWILIO_ACCOUNT_SID; // Replace with your Account SID
const authToken = process.env.TWILIO_AUTH_TOKEN; // Replace with your Auth Token
const client = new Twilio(accountSid, authToken);

export async function getToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const chatGrant = new ChatGrant({
      serviceSid: process.env.TWILIO_SERVICE_SID,
    });

    // Creating token
    const token = new AccessToken(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_API_KEY!,
      process.env.TWILIO_API_SECRET!,
      {
        identity: authUser._id.toString(),
      }
    );
    token.addGrant(chatGrant);

    res
      .status(StatusCodes.OK)
      .json({ success: true, data: { token: token.toJwt() } });
  } catch (err) {
    next(err);
  }
}

export const createConversationValidation: ValidationChain[] = [
  body("user").isMongoId(),
];
export async function createConversation(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const user = new mongoose.Types.ObjectId(req.body.user as string);

    const [creatorUser, participant] = await Promise.all([
      User.findById(authUser._id).orFail(
        createError(
          dynamicMessage(dStrings.notFound, "User"),
          StatusCodes.NOT_FOUND
        )
      ),
      User.findById(user).orFail(
        createError(
          dynamicMessage(dStrings.notFound, "User"),
          StatusCodes.NOT_FOUND
        )
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
      return res
        .status(StatusCodes.OK)
        .json({ success: true, data: alreadyExists });
    }

    const friendlyName = authUser._id.toString() + "_" + user;

    const twilioConversation =
      await client.conversations.v1.conversations.create({
        friendlyName: friendlyName,
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
        { $push: { conversations: conversation._id } }
      ),
      User.updateOne(
        { _id: authUser._id },
        { $push: { conversations: conversation._id } }
      ),
    ]);

    res.status(StatusCodes.CREATED).json({ success: true, data: conversation });
  } catch (err) {
    next(err);
  }
}

export const createGroupConversationValidation: ValidationChain[] = [
  body("users").isArray({ min: 2 }),
  body("users.*").isMongoId(),
  body("name").optional().isString(),
];
export async function createGroupConversation(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const name: string | undefined = req.body.name;
    const users = Array.from(new Set(req.body.users as string[])).map(
      (user) => new mongoose.Types.ObjectId(user)
    );

    const authUser = req.user!;

    const friendlyName = name || "Group Chat";

    const twilioConversation =
      await client.conversations.v1.conversations.create({
        friendlyName: friendlyName,
      });

    const creatorUser = await User.findById(authUser._id)
      .orFail(
        createError(
          dynamicMessage(dStrings.notFound, "User"),
          StatusCodes.NOT_FOUND
        )
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
        { $push: { conversations: conversation._id } }
      );
    }

    await User.updateOne(
      { _id: authUser._id },
      { $push: { conversations: conversation._id } }
    );

    res.status(StatusCodes.CREATED).json({ success: true, data: conversation });
  } catch (err) {
    next(err);
  }
}

// remove a user from the gp
export const removeUserFromGroupConversationValidation: ValidationChain[] = [
  body("user").isMongoId(),
  param("id").isString(),
];
export async function removeUserFromGroupConversation(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const id: string = req.params.id;
    const user = new mongoose.Types.ObjectId(req.body.user as string);

    //check if we are the creator of the channel

    // List all participants and find the one with the matching identity
    const participants = await client.conversations.v1
      .conversations(id)
      .participants.list();

    const participantToRemove = participants.find(
      (participant) => participant.identity === user.toString()
    );

    if (participantToRemove && participants.length === 1) {
      // Remove the conversation if the user is the only participant
      await Promise.all([
        Conversation.deleteOne({ _id: id }),
        client.conversations.v1.conversations(id).remove(),
        User.updateOne({ _id: user }, { $pull: { conversations: id } }),
      ]);
    }

    if (participantToRemove) {
      // Remove the found participant
      await client.conversations.v1
        .conversations(id)
        .participants(participantToRemove.sid)
        .remove();
    } else {
      throw createError(
        "Participant not found in this conversation.",
        StatusCodes.NOT_FOUND
      );
    }

    // Update the database to reflect participant removal
    const conversation = await Conversation.findById(id).orFail(
      createError(
        dynamicMessage(dStrings.notFound, "Conversation"),
        StatusCodes.NOT_FOUND
      )
    );

    conversation.participants = conversation.participants.filter(
      (p) => !p.user.equals(user)
    );

    await Promise.all([
      conversation.save(),
      User.updateOne({ _id: user }, { $pull: { conversations: id } }),
    ]);

    res.status(StatusCodes.OK).json({ success: true, data: conversation });
  } catch (err) {
    next(err);
  }
}

// update the group name

export async function getConversations(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

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

export const getConversationValidation: ValidationChain[] = [
  param("id").isString(),
];

export async function getConversation(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const id: string = req.params.id;

    const conversation = await Conversation.findOne({
      _id: id,
      participants: {
        $elemMatch: { user: authUser._id },
      },
    })
      .orFail(
        createError(
          dynamicMessage(dStrings.notFound, "Conversation"),
          StatusCodes.NOT_FOUND
        )
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

export async function sendAttributtedMessage(
  by: mongoose.Types.ObjectId,
  to: mongoose.Types.ObjectId,
  message: string,
  attributes: object
) {
  const [byUser, toUser] = await Promise.all([
    User.findById(by).select<{ name: string }>("name").lean(),
    User.findById(to).select<{ name: string }>("name").lean(),
  ]);

  if (!byUser || !toUser) {
    throw createError(
      dynamicMessage(dStrings.notFound, "User"),
      StatusCodes.NOT_FOUND
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
        StatusCodes.BAD_REQUEST
      );
    }

    if (
      !participants.find((p) => p.identity === by.toString()) ||
      !participants.find((p) => p.identity === to.toString())
    ) {
      sent = false;
      logger.error(
        `Participant ${by} or ${to} found in the conversation ${alreadyExists._id} but data did not match`
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
        { $push: { conversations: conversation._id } }
      ),
      User.updateOne(
        { _id: toUser._id },
        { $push: { conversations: conversation._id } }
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
      `Failed to send message from ${by.toString()} to ${to.toString()} with message ${message}`
    );
  }
}
