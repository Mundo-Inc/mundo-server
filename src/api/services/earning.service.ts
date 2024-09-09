import mongoose from "mongoose";

import { StatusCodes } from "http-status-codes";
import User from "../../models/user/user.js";
import SocketService from "../../socket/index.js";
import { dStrings as ds, dynamicMessage } from "../../strings.js";
import { createError } from "../../utilities/errorHandlers.js";

export const reviewCoins = { normalValue: 1, expLimit: 5, expMul: 10 };
export const imageCoins = 2;
export const videoCoins = 2;
export const checkinCoins = { normalValue: 1, expLimit: 5, expMul: 10 };
export const placeCoins = { normalValue: 1, expLimit: 5, expMul: 10 };

export enum EarningsType {
  MEDIA_INCLUDED_USER_ACTIVITY = "MEDIA_INCLUDED_USER_ACTIVITY",
  GAINED_REACTIONS = "GAINED_REACTIONS",
}

export const earningTitles = {
  MEDIA_INCLUDED_USER_ACTIVITY: "Media included in your activity",
  GAINED_REACTIONS: "Gained reactions",
};

const earningValues = {
  MEDIA_INCLUDED_USER_ACTIVITY: 20,
  GAINED_REACTIONS: 5, //per 10 unique users
};

export const UNIQUE_USERS_REQUIRED_TO_REWARD = 10;

// adding USD Earnings in Cents
export const addEarnings = async (
  userId: mongoose.Types.ObjectId,
  earningType: EarningsType,
) => {
  const user = await User.findById(userId).orFail(
    createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND),
  );

  user.earnings.balance = user.earnings.balance + earningValues[earningType];
  user.earnings.total = user.earnings.total + earningValues[earningType];

  await user.save();

  SocketService.emitToUser(userId, SocketService.STCEvents.Earnings, {
    type: earningType,
    title: earningTitles[earningType],
    amount: earningValues[earningType],
    total: user.earnings.total,
    balance: user.earnings.balance,
  });
};
