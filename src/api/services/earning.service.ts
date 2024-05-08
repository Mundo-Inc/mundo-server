import { type Types } from "mongoose";

import type { ICheckIn } from "../../models/CheckIn";
import Earning, { EarningTypeEnum } from "../../models/Earning";
import type { IPlace } from "../../models/Place";
import type { IReview } from "../../models/Review";
import User, { type IUser } from "../../models/User";

export const reviewCoins = { normalValue: 1, expLimit: 5, expMul: 10 };
export const imageCoins = 2;
export const videoCoins = 2;
export const checkinCoins = { normalValue: 1, expLimit: 5, expMul: 10 };
export const placeCoins = { normalValue: 1, expLimit: 5, expMul: 10 };

export const reviewEarning = async (
  userId: Types.ObjectId,
  review: IReview
) => {
  const user: IUser | null = await User.findById(userId);

  if (!user) return;

  const reviewEarns = await Earning.find({
    userId: user._id,
    earningType: EarningTypeEnum.Review,
  });
  let totalCoins = 0;
  totalCoins +=
    reviewCoins.normalValue *
    (reviewEarns && reviewEarns.length >= reviewCoins.expLimit
      ? reviewCoins.expMul
      : 1);

  if (review.images && review.images.length > 0) {
    totalCoins += imageCoins;
  }
  if (review.videos && review.videos.length > 0) {
    totalCoins += videoCoins;
  }
  user.coins += totalCoins;
  await user.save();
  await Earning.create({
    userId: user._id,
    earningType: EarningTypeEnum.Review,
    earning: review._id,
    coins: totalCoins,
  });
};
export const checkinEarning = async (
  userId: Types.ObjectId,
  checkin: ICheckIn
) => {
  const user: IUser | null = await User.findById(userId);

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
    earning: checkin._id,
    coins: totalCoins,
  });
};
export const placeEarning = async (user: IUser, place: IPlace) => {
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
