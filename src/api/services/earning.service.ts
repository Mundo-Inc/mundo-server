import type { Document, Types } from "mongoose";
import mongoose from "mongoose";

import { StatusCodes } from "http-status-codes";
import Earning, { EarningTypeEnum } from "../../models/Earning.js";
import { MediaTypeEnum } from "../../models/Media.js";
import type { IPlace } from "../../models/Place.js";
import type { IUser } from "../../models/User.js";
import User from "../../models/User.js";
import SocketService from "../../socket.js";
import { dStrings as ds, dynamicMessage } from "../../strings.js";
import { createError } from "../../utilities/errorHandlers.js";
import type { MediaProjectionBrief } from "../dto/media.js";

export const reviewCoins = { normalValue: 1, expLimit: 5, expMul: 10 };
export const imageCoins = 2;
export const videoCoins = 2;
export const checkinCoins = { normalValue: 1, expLimit: 5, expMul: 10 };
export const placeCoins = { normalValue: 1, expLimit: 5, expMul: 10 };

export const reviewEarning = async (
  userId: Types.ObjectId,
  reviewId: Types.ObjectId,
  media?: MediaProjectionBrief[],
) => {
  const user = await User.findById(userId);

  if (!user) return;

  const reviewEarns = await Earning.find({
    userId: user._id,
    earningType: EarningTypeEnum.Review,
  });

  let totalCoins =
    reviewCoins.normalValue *
    (reviewEarns && reviewEarns.length >= reviewCoins.expLimit
      ? reviewCoins.expMul
      : 1);

  if (media && media.length > 0) {
    if (media.some((m) => m.type === MediaTypeEnum.Image)) {
      totalCoins += imageCoins;
    }
    if (media.some((m) => m.type === MediaTypeEnum.Video)) {
      totalCoins += videoCoins;
    }
  }
  user.coins += totalCoins;
  await user.save();
  await Earning.create({
    userId: user._id,
    earningType: EarningTypeEnum.Review,
    earning: reviewId,
    coins: totalCoins,
  });
};

export const checkinEarning = async (
  userId: Types.ObjectId,
  checkInId: Types.ObjectId,
) => {
  const user = await User.findById(userId);

  if (!user) return;

  const checkinEarns = await Earning.find({
    userId: user._id,
    earningType: EarningTypeEnum.CheckIn,
  });
  let totalCoins = 0;
  totalCoins +=
    checkinCoins.normalValue *
    (checkinEarns && checkinEarns.length >= checkinCoins.expLimit
      ? checkinCoins.expMul
      : 1);
  user.coins += totalCoins;
  await user.save();
  await Earning.create({
    userId: user._id,
    earningType: EarningTypeEnum.CheckIn,
    earning: checkInId,
    coins: totalCoins,
  });
};

export const placeEarning = async (
  user: IUser & Document<any, any, IUser>,
  place: IPlace,
) => {
  const placeEarns = await Earning.find({
    userId: user._id,
    earningType: EarningTypeEnum.Place,
  });
  let totalCoins = 0;
  totalCoins +=
    placeCoins.normalValue *
    (placeEarns && placeEarns.length >= placeCoins.expLimit
      ? placeCoins.expMul
      : 1);
  user.coins += totalCoins;
  await user.save();
  await Earning.create({
    userId: user._id,
    earningType: EarningTypeEnum.Place,
    earning: place._id,
    coins: totalCoins,
  });
};

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
  try {
    const user = await User.findById(userId).orFail(
      createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND),
    );

    if (!user.earnings) {
      user.earnings = { total: 0, balance: 0 };
    }

    user.earnings.balance = user.earnings.balance + earningValues[earningType];
    user.earnings.total = user.earnings.total + earningValues[earningType];

    await user.save();

    SocketService.emitToUser(userId, SocketService.Events.Earnings, {
      type: earningType,
      title: earningTitles[earningType],
      amount: earningValues[earningType],
      total: user.earnings.total,
      balance: user.earnings.balance,
    });
  } catch (error) {
    throw createError("Error adding reward (usd)" + error, 500);
  }
};

export const redeemEarnings = async (userId: mongoose.Types.ObjectId) => {
  //TODO: WiP.
};
