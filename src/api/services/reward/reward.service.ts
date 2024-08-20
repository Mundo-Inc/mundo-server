import { StatusCodes } from "http-status-codes";
import mongoose, { type Document } from "mongoose";

import CheckIn from "../../../models/CheckIn.js";
import Comment from "../../../models/Comment.js";
import Homemade from "../../../models/Homemade.js";
import Media from "../../../models/Media.js";
import Reaction from "../../../models/Reaction.js";
import Review from "../../../models/Review.js";
import Reward from "../../../models/Reward.js";
import User, { type IUser } from "../../../models/user/user.js";
import { createError } from "../../../utilities/errorHandlers.js";
import MediaProjection, { type MediaProjectionBrief } from "../../dto/media.js";
import logger from "../logger/index.js";
import { UserActivityManager } from "../userActivityManager.js";
import { eligibleForAchivement } from "./helpers/achivementEligibility.js";
import { checkNewLevelupAchivements } from "./helpers/achivements.js";
import { calcLevel, calcReviewReward } from "./helpers/levelCalculations.js";
import {
  validateCheckInReward,
  validateCommentReward,
  validateHomemadeReward,
  validateReactionReward,
  validateReviewReward,
} from "./helpers/validations.js";
import { rewards_amounts } from "./utils/rewardsAmounts.js";

const getValidatedEntity = async (
  refType: string,
  refId: mongoose.Types.ObjectId,
  user: IUser,
) => {
  switch (refType) {
    case "Homemade":
      const homemade = await Homemade.findById(refId);

      if (!homemade || !(await validateHomemadeReward(user))) {
        return null;
      }

      return { entity: homemade, rewardAmount: rewards_amounts.HOMEMADE };
    case "CheckIn":
      const checkin = await CheckIn.findById(refId);
      if (!checkin || !(await validateCheckInReward(user, checkin)))
        return null;
      return { entity: checkin, rewardAmount: rewards_amounts.CHECKIN };

    case "Comment":
      const comment = await Comment.findById(refId);
      if (!comment || !(await validateCommentReward(user, comment)))
        return null;
      return { entity: comment, rewardAmount: rewards_amounts.COMMENT };

    case "Review":
      const review = await Review.findById(refId).lean();

      if (!review) return null;

      const media = review.media
        ? await Media.find({ _id: { $in: review.media } })
            .select<MediaProjectionBrief>(MediaProjection.brief)
            .lean()
        : [];

      if (!(await validateReviewReward(user, review))) return null;

      return { entity: review, rewardAmount: calcReviewReward(review, media) };

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
  user: IUser & Document<any, any, IUser>,
  refType: string,
  refId: mongoose.Types.ObjectId,
  amount: number,
  customAchivements: mongoose.Types.ObjectId[],
  userActivityId?: mongoose.Types.ObjectId,
  placeId?: mongoose.Types.ObjectId,
) => {
  try {
    await Reward.create({
      userId: user._id,
      reason: { refType, refId, userActivityId, placeId },
      amount,
    });

    const oldXP = user.progress.xp || 0;
    const oldLevel = user.progress.level || 1;

    user.progress.xp = oldXP + amount;
    user.progress.level = calcLevel(user.progress.xp);

    const newLevelupAchivements = await checkNewLevelupAchivements(
      user,
      oldLevel,
      user.progress.level,
    );
    await user.save();

    if (oldLevel && oldLevel !== user.progress.level) {
      await UserActivityManager.createLevelUpActivity(
        user,
        user.progress.level,
      );
    }

    return {
      oldXP,
      currentXP: user.progress.xp,
      oldLevel,
      currentLevel: user.progress.level,
      newAchivements: [...newLevelupAchivements, ...customAchivements],
    };
  } catch (error) {
    throw createError(
      "error creating reward and assigning to the user" + error,
      StatusCodes.INTERNAL_SERVER_ERROR,
    );
  }
};

export const addReward = async (
  userId: mongoose.Types.ObjectId,
  reason: {
    refType: string;
    refId: mongoose.Types.ObjectId | undefined;
    userActivityId?: mongoose.Types.ObjectId;
    placeId?: mongoose.Types.ObjectId;
  },
) => {
  try {
    const user = await User.findById(userId);

    if (!reason.refId || !user) return;

    const validatedEntity = await getValidatedEntity(
      reason.refType,
      reason.refId,
      user,
    );

    let customAchivements = [];

    if (["Review", "Reaction", "CheckIn"].includes(reason.refType)) {
      const achivements = await checkForCustomAchivements(
        user._id,
        reason.refType,
      );
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
        reason.placeId,
      );
    } else {
      return {
        newAchivements: [...customAchivements],
      };
    }
  } catch (error) {
    throw createError("Error adding reward!" + error, 500);
  }
};

const checkForCustomAchivements = async (
  userId: mongoose.Types.ObjectId,
  activityType: string,
) => {
  try {
    const user = await User.findById(userId);

    if (!user) return;

    let newAchivements = [];
    switch (activityType) {
      case "Review":
        for (let reviewAchivementType of [
          "ROOKIE_REVIEWER",
          "CRITIC_ON_THE_RISE",
          "PAPARAZZI_PRO",
        ]) {
          const reviewAchivement = await eligibleForAchivement(
            userId,
            reviewAchivementType,
          );
          logger.debug(
            "eligibile for " + reviewAchivementType + reviewAchivement,
          );

          if (reviewAchivement) {
            user.progress.achievements.push(reviewAchivement._id);
            await user.save();
            newAchivements.push(reviewAchivement._id);
          }
        }
        break;

      case "CheckIn":
        for (let checkinAchivementType of [
          "CHECK_CHECK",
          "EARLY_BIRD",
          "NIGHT_OWL",
        ]) {
          const checkinAchivement = await eligibleForAchivement(
            userId,
            checkinAchivementType,
          );
          if (checkinAchivement) {
            user.progress.achievements.push(checkinAchivement._id);
            await user.save();
            newAchivements.push(checkinAchivement._id);
          }
        }
        break;

      case "Reaction":
        for (let reactionAchivementType of ["REACT_ROLL"]) {
          const reactionAchivement = await eligibleForAchivement(
            userId,
            reactionAchivementType,
          );
          if (reactionAchivement) {
            user.progress.achievements.push(reactionAchivement._id);
            await user.save();
            newAchivements.push(reactionAchivement._id);
          }
        }
        break;

      default:
        break;
    }
    return newAchivements;
  } catch (error) {}
};
