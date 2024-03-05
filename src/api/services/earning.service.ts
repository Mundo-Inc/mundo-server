import type { ICheckIn } from "../../models/CheckIn";
import type { IDeal } from "../../models/Deal";
import Earning, { EarningTypeEnum } from "../../models/Earning";
import type { IPlace } from "../../models/Place";
import type { IReview } from "../../models/Review";
import User from "../../models/User";

export const reviewCoins = { normalValue: 1, expLimit: 5, expMul: 10 };
export const imageCoins = 2;
export const videoCoins = 2;
export const checkinCoins = { normalValue: 1, expLimit: 5, expMul: 10 };
export const placeCoins = { normalValue: 1, expLimit: 5, expMul: 10 };
export const dealCoins = { normalValue: 1, expLimit: 5, expMul: 10 };

export const reviewEarning = async (userId: string, review: IReview) => {
  const user = await User.findById(userId);
  const reviewEarns = await Earning.find({
    userId,
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
    userId,
    earningType: EarningTypeEnum.Review,
    earning: review._id,
    coins: totalCoins,
  });
};
export const checkinEarning = async (userId: string, checkin: ICheckIn) => {
  const user = await User.findById(userId);
  const checkinEarns = await Earning.find({
    userId,
    earningType: EarningTypeEnum.Checkin,
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
    userId,
    earningType: EarningTypeEnum.Checkin,
    earning: checkin._id,
    coins: totalCoins,
  });
};
export const placeEarning = async (userId: string, place: IPlace) => {
  const user = await User.findById(userId);
  const placeEarns = await Earning.find({
    userId,
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
    userId,
    earningType: EarningTypeEnum.Place,
    earning: place._id,
    coins: totalCoins,
  });
};
export const dealEarning = async (deal: IDeal) => {
  const creator = await User.findById(deal.creator);
  const dealEarns = await Earning.find({
    userId: creator._id,
    earningType: EarningTypeEnum.Deal,
  });
  let totalCoins = 0;
  totalCoins +=
    dealCoins.normalValue *
    (dealEarns && dealEarns.length >= dealCoins.expLimit
      ? dealCoins.expMul
      : 1);
  creator.coins += totalCoins;
  await creator.save();
  await Earning.create({
    userId: creator._id,
    earningType: EarningTypeEnum.Deal,
    earning: deal._id,
    coins: totalCoins,
  });
};
