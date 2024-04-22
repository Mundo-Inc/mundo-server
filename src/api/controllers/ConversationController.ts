import type { NextFunction, Request, Response } from "express";
import { body, param, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";
import twilio, { Twilio } from "twilio";

import Conversation, { IConversation } from "../../models/Conversation";
import User, { type IUser } from "../../models/User";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { publicReadUserEssentialProjection } from "../dto/user/read-user-public.dto";

const AccessToken = twilio.jwt.AccessToken;
const ChatGrant = AccessToken.ChatGrant;

// Twilio setup
const accountSid = process.env.TWILIO_ACCOUNT_SID; // Replace with your Account SID
const authToken = process.env.TWILIO_AUTH_TOKEN; // Replace with your Auth Token
const client = new Twilio(accountSid, authToken);

export const getTokenValidation: ValidationChain[] = [];
export async function getToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: authId } = req.user!;

    const chatGrant = new ChatGrant({
      serviceSid: process.env.TWILIO_SERVICE_SID,
    });

    // Creating token
    const token = new AccessToken(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_API_KEY!,
      process.env.TWILIO_API_SECRET!,
      {
        identity: authId,
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

    const {
      user,
    }: {
      user: string;
    } = req.body;
    const { id: authId } = req.user!;

    const alreadyExists = await Conversation.aggregate([
      {
        $match: {
          participants: {
            $all: [
              { $elemMatch: { user: new mongoose.Types.ObjectId(user) } },
              { $elemMatch: { user: new mongoose.Types.ObjectId(authId) } },
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
          friendly_name: 1,
        },
      },
    ]);

    if (alreadyExists.length > 0) {
      return res
        .status(StatusCodes.OK)
        .json({ success: true, data: alreadyExists[0] });
    }

    const friendlyName = authId + "_" + user;

    const twilioConversation =
      await client.conversations.v1.conversations.create({
        friendlyName: friendlyName,
      });

    const creatorUser = (await User.findById(authId)) as IUser;
    const participant = (await User.findById(user)) as IUser;

    // Add participants to the Twilio conversation
    const creatorUserParticipant = await client.conversations.v1
      .conversations(twilioConversation.sid)
      .participants.create({
        identity: authId.toString(),
        attributes: JSON.stringify({
          name: creatorUser.name,
        }),
      });

    const userParticipant = await client.conversations.v1
      .conversations(twilioConversation.sid)
      .participants.create({
        identity: user.toString(),
        attributes: JSON.stringify({
          name: participant.name,
        }),
      });

    const conversation = new Conversation({
      _id: twilioConversation.sid, // Use the SID as the unique ID
      friendly_name: friendlyName, // Assuming friendlyName is defined elsewhere
      participants: [
        {
          user: new mongoose.Types.ObjectId(authId),
          role: "participant",
          chat: creatorUserParticipant.sid,
        },
        {
          user: new mongoose.Types.ObjectId(user),
          role: "participant",
          chat: userParticipant.sid,
        },
      ],
      createdBy: new mongoose.Types.ObjectId(authId),
      is_closed: false,
    });

    await conversation.save();

    await User.updateOne(
      { _id: user },
      { $push: { conversations: conversation._id } }
    );

    await User.updateOne(
      { _id: authId },
      { $push: { conversations: conversation._id } }
    );

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

    const {
      users,
      name,
    }: {
      users: [string];
      name: string | undefined;
    } = req.body;
    const { id: authId } = req.user!;

    const friendlyName = name || "Group Chat";

    const twilioConversation =
      await client.conversations.v1.conversations.create({
        friendlyName: friendlyName,
      });

    const creatorUser = (await User.findById(authId)) as IUser;

    const participantsUsers: IUser[] = await User.find({
      _id: { $in: users },
    });

    // Add participants to the Twilio conversation
    const creatorUserParticipant = await client.conversations.v1
      .conversations(twilioConversation.sid)
      .participants.create({
        identity: authId.toString(),
        attributes: JSON.stringify({
          name: creatorUser.name,
        }),
      });

    let twilioParticipants = [
      {
        user: new mongoose.Types.ObjectId(authId),
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

    const conversation = new Conversation({
      _id: twilioConversation.sid, // Use the SID as the unique ID
      friendly_name: friendlyName, // Assuming friendlyName is defined elsewhere
      participants: twilioParticipants,
      createdBy: new mongoose.Types.ObjectId(authId),
      is_closed: false,
    });

    await conversation.save();

    for (const participant of participantsUsers) {
      await User.updateOne(
        { _id: participant._id },
        { $push: { conversations: conversation._id } }
      );
    }

    await User.updateOne(
      { _id: authId },
      { $push: { conversations: conversation._id } }
    );

    res.status(StatusCodes.CREATED).json({ success: true, data: conversation });
  } catch (err) {
    console.log(err);

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

    const { id } = req.params;
    const { user } = req.body;

    //check if we are the creator of the channel

    // List all participants and find the one with the matching identity
    const participants = await client.conversations.v1
      .conversations(id)
      .participants.list();

    const participantToRemove = participants.find(
      (participant) => participant.identity === user
    );

    if (participantToRemove) {
      // Remove the found participant
      await client.conversations.v1
        .conversations(id)
        .participants(participantToRemove.sid)
        .remove();
    } else {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Participant not found in this conversation.",
      });
    }

    // Update the database to reflect participant removal
    const conversation: IConversation | null = await Conversation.findById(id);
    if (!conversation) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Conversation not found.",
      });
    }

    conversation.participants = conversation.participants.filter(
      (p) => p.user.toString() !== user
    );
    await conversation.save();

    // Optionally, update the user's conversation list
    await User.updateOne({ _id: user }, { $pull: { conversations: id } });

    res.status(StatusCodes.OK).json({ success: true, data: conversation });
  } catch (err) {
    console.log(err);
    next(err);
  }
}

// update the group name

export const getConversationsValidation: ValidationChain[] = [];

export async function getConversations(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: authId } = req.user!;

    const user = (await User.findById(authId, ["conversations"]).populate({
      path: "conversations",
      populate: {
        path: "participants.user",
        select: publicReadUserEssentialProjection,
      },
    })) as IUser;

    const conversations = user.conversations;

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

    const { id: authId } = req.user!;
    const { id } = req.params;

    const conversation = await Conversation.findOne({
      _id: id,
      participants: {
        $elemMatch: { user: new mongoose.Types.ObjectId(authId) },
      },
    })
      .populate({
        path: "participants.user",
        select: publicReadUserEssentialProjection,
      })
      .lean();

    if (!conversation) {
      throw createError("Conversation not found", StatusCodes.NOT_FOUND);
    }

    res.status(StatusCodes.OK).json({ success: true, data: conversation });
  } catch (err) {
    next(err);
  }
}
