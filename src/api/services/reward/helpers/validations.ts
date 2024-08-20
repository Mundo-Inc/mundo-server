import type { ICheckIn } from "../../../../models/CheckIn.js";
import type { IComment } from "../../../../models/Comment.js";
import type { IReaction } from "../../../../models/Reaction.js";
import type { IReview } from "../../../../models/Review.js";
import Reward from "../../../../models/Reward.js";
import type { IUser } from "../../../../models/user/user.js";
import logger from "../../logger/index.js";
import { thresholds } from "../utils/threshold.js";

export const validateReviewReward = async (user: IUser, review: IReview) => {
  try {
    // check if the user has already been rewarded for the comment
    const existingRewards = await Reward.countDocuments({
      userId: user._id,
      "reason.refType": "Review",
      "reason.placeId": review.place,
    });

    if (existingRewards >= thresholds.MAX_REVIEW_PER_PLACE) return false;
    return true;
  } catch (error) {
    logger.error("Error for validating review reward", { error });
    //TODO: we have to fix this instead of saying not eligible.
    return false;
  }
};

export const validateReactionReward = async (
  user: IUser,
  reaction: IReaction,
) => {
  try {
    // check if the user has already been rewarded for the review
    const reward = await Reward.findOne({
      userId: user._id,
      "reason.refType": "Reaction",
      "reason.userActivityId": reaction.target,
    });

    if (reward) return false;
    return true;
  } catch (error) {
    logger.error("Error for validating reaction reward", { error });
    //TODO: we have to fix this instead of saying not eligible.
    return false;
  }
};

export const validateCommentReward = async (user: IUser, comment: IComment) => {
  try {
    // check if the user has already been rewarded for the comment
    const reward = await Reward.findOne({
      userId: user._id,
      "reason.refType": "Comment",
      "reason.userActivityId": comment.userActivity,
    });
    if (reward) return false;
    return true;
  } catch (error) {
    logger.error("Error for validating comment reward", { error });
    //TODO: we have to fix this instead of saying not eligible.
    return false;
  }
};

export const validateCheckInReward = async (user: IUser, checkIn: ICheckIn) => {
  try {
    // check if the user has already been rewarded for the
    const existingRewards = await Reward.find({
      userId: user._id,
      "reason.refType": "CheckIn",
      "reason.placeId": checkIn.place,
      createdAt: {
        // checkin for last day
        $gte: new Date(new Date().getTime() - 24 * 60 * 60 * 1000),
      },
    });

    if (existingRewards.length >= thresholds.MAX_CHECKIN_PER_PLACE)
      return false;
    return true;
  } catch (error) {
    logger.error("Error for validating check-in reward", { error });
    //TODO: we have to fix this instead of saying not eligible.
    return false;
  }
};

export const validateHomemadeReward = async (user: IUser) => {
  try {
    // check if the user has already been rewarded for the
    const existingRewards = await Reward.find({
      userId: user._id,
      "reason.refType": "Homemade",
      createdAt: {
        // homemade for last day
        $gte: new Date(new Date().getTime() - 24 * 60 * 60 * 1000),
      },
    });

    if (existingRewards.length >= thresholds.MAX_CHECKIN_PER_PLACE)
      return false;
    return true;
  } catch (error) {
    logger.error("Error for validating check-in reward", { error });
    //TODO: we have to fix this instead of saying not eligible.
    return false;
  }
};
