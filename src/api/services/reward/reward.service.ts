import mongoose from "mongoose";
import Reaction from "../../../models/Reaction";
import Review from "../../../models/Review";
import Reward from "../../../models/Reward";
import User, { IUser } from "../../../models/User";
import { checkNewLevelupAchivements } from "./helpers/achivements";
import { calcLevel, calcReviewReward } from "./helpers/levelCalculations";
import {
  validateCheckinReward,
  validateCommentReward,
  validateReactionReward,
  validateReviewReward,
} from "./helpers/validations";
import { rewards_amounts } from "./utils/rewardsAmounts";
import Comment from "../../../models/Comment";
import CheckIn from "../../../models/CheckIn";
import { AchievementTypeEnum } from "../../../models/Achievement";
import { eligibleForAchivement } from "./helpers/achivementEligibility";

const getValidatedEntity = async (
  refType: string,
  refId: mongoose.Types.ObjectId,
  user: IUser
) => {
  switch (refType) {
    case "Checkin":
      const checkin = await CheckIn.findById(refId);
      if (!checkin || !(await validateCheckinReward(user, checkin)))
        return null;
      return { entity: checkin, rewardAmount: rewards_amounts.CHECKIN };

    case "Comment":
      const comment = await Comment.findById(refId);
      if (!comment || !(await validateCommentReward(user, comment)))
        return null;
      return { entity: comment, rewardAmount: rewards_amounts.COMMENT };

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
  amount: number,
  customAchivements: mongoose.Types.ObjectId[],
  userActivityId?: mongoose.Types.ObjectId,
  placeId?: mongoose.Types.ObjectId
) => {
  const reward = await Reward.create({
    userId: user._id,
    reason: { refType, refId, userActivityId, placeId },
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
    newAchivements: [...newLevelupAchivements, ...customAchivements],
  };
};

export const addReward = async (
  userId: string,
  reason: {
    refType: string;
    refId: mongoose.Types.ObjectId | undefined;
    userActivityId?: mongoose.Types.ObjectId;
    placeId?: mongoose.Types.ObjectId;
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

    let customAchivements = [];
    if (reason.refType === "Checkin") {
      const achivements = await checkForCustomAchivements(user._id, "Checkin");
      if (achivements && achivements.length > 0)
        customAchivements.push(...achivements);
    }

    if (validatedEntity) {
      return await saveRewardAndUpdateUser(
        user,
        reason.refType,
        reason.refId,
        validatedEntity.rewardAmount,
        customAchivements,
        reason.userActivityId,
        reason.placeId
      );
    } else {
      return {
        newAchivements: [...customAchivements],
      };
    }
  } catch (error) {
    console.log(error);
    throw new Error("Error adding reward");
  }
};

export const checkForCustomAchivements = async (
  userId: string,
  activityType:
    | "Checkin"
    | "Comment"
    | "Review"
    | "Reaction"
    | "Poll"
    | "Follow"
    | "AddPlace"
) => {
  try {
    const user = await User.findById(userId);
    let newAchivements = [];
    switch (activityType) {
      case "Review":
        break;

      case "Checkin":
        const achivement = await eligibleForAchivement(
          userId,
          AchievementTypeEnum.CHECK_CHECK
        );
        if (achivement) {
          user.progress.achievements.push(achivement._id);
          await user.save();
          newAchivements.push(achivement._id);
        }
        break;
      default:
        break;
    }
    return newAchivements;
  } catch (error) {}
};
