import type { ICheckIn } from "../../../../models/CheckIn";
import type { IComment } from "../../../../models/Comment";
import type { IReaction } from "../../../../models/Reaction";
import type { IReview } from "../../../../models/Review";
import Reward from "../../../../models/Reward";
import type { IUser } from "../../../../models/User";
import logger from "../../logger";
import { thresholds } from "../utils/threshold";

export const validateReviewReward = async (user: IUser, review: IReview) => {
  try {
    // check if the user has already been rewarded for the comment
    const existingRewards = await Reward.find({
      userId: user._id,
      "reason.refType": "Review",
      "reason.placeId": review.place,
    });

    if (existingRewards.length >= thresholds.MAX_REVIEW_PER_PLACE) return false;
    return true;
  } catch (error) {
    logger.error("Error for validating review reward", { error });
    //TODO: we have to fix this instead of saying not eligible.
    return false;
  }
};

export const validateReactionReward = async (
  user: IUser,
  reaction: IReaction
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

export const validateCheckinReward = async (user: IUser, checkin: ICheckIn) => {
  try {
    // check if the user has already been rewarded for the
    const existingRewards = await Reward.find({
      userId: user._id,
      "reason.refType": "Checkin",
      "reason.placeId": checkin.place,
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
