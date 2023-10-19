import mongoose from "mongoose";
import Reaction from "../../../models/Reaction";
import Review from "../../../models/Review";
import Reward from "../../../models/Reward";
import User, { IUser } from "../../../models/User";
import { checkNewLevelupAchivements } from "./helpers/achivements";
import { calcLevel, calcReviewReward } from "./helpers/levelCalculations";
import {
  validateReactionReward,
  validateReviewReward,
} from "./helpers/validations";
import { rewards_amounts } from "./utils/rewardsAmounts";

const getValidatedEntity = async (
  refType: string,
  refId: mongoose.Types.ObjectId,
  user: IUser
) => {
  switch (refType) {
    case "Review":
      const review = await Review.findById(refId);
      if (!review || !(await validateReviewReward(user, review))) return null;
      return { entity: review, rewardAmount: calcReviewReward(review) };

    case "Reaction":
      const reaction = await Reaction.findById(refId);
      if (!reaction || !(await validateReactionReward(user, reaction)))
        return null;
      return { entity: reaction, rewardAmount: rewards_amounts.REACTION };

    default:
      return null;
  }
};

const saveRewardAndUpdateUser = async (
  user: IUser,
  refType: string,
  refId: mongoose.Types.ObjectId,
  amount: number
) => {
  const reward = await Reward.create({
    userId: user._id,
    reason: { refType, refId },
    amount,
  });
  await reward.save();

  const oldXP = user.progress.xp || 0;
  const oldLevel = user.progress.level || 1;

  user.progress.xp = oldXP + amount;
  user.progress.level = calcLevel(user.progress.xp);

  const newLevelupAchivements = await checkNewLevelupAchivements(
    user,
    oldLevel,
    user.progress.level
  );
  await user.save();

  return {
    oldXP,
    currentXP: user.progress.xp,
    oldLevel,
    currentLevel: user.progress.level,
    newLevelupAchivements,
  };
};

export const addReward = async (
  userId: string,
  reason: {
    refType: string;
    refId: mongoose.Types.ObjectId | undefined;
  }
) => {
  try {
    const user = await User.findById(userId);
    if (!reason.refId) return;

    const validatedEntity = await getValidatedEntity(
      reason.refType,
      reason.refId,
      user
    );
    if (!validatedEntity) return;

    return await saveRewardAndUpdateUser(
      user,
      reason.refType,
      reason.refId,
      validatedEntity.rewardAmount
    );
  } catch (error) {
    console.log(error);
    throw new Error("Error adding reward");
  }
};
