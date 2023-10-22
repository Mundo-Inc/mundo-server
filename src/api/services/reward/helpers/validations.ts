import { ActivityPrivacyTypeEnum } from "./../../../../models/UserActivity";
import Comment, { IComment } from "../../../../models/Comment";
import { IReaction } from "../../../../models/Reaction";
import Review, { IReview } from "../../../../models/Review";
import Reward from "../../../../models/Reward";
import { IUser } from "../../../../models/User";
import { thresholds } from "../utils/threshold";
import { ICheckIn } from "../../../../models/CheckIn";

export const validateReviewReward = async (user: IUser, review: IReview) => {
  try {
    // check how many time the user has reviewed the place
    const userReviewsCount = await Review.countDocuments({
      writer: user._id,
      place: review.place,
    });
    if (thresholds.MAX_REVIEW_REWARD_PER_PLACE <= userReviewsCount)
      return false;
    // check if the user has already been rewarded for the review
    const reward = await Reward.findOne({
      userId: user._id,
      reason: {
        refType: "Review",
        refId: review._id,
      },
    });
    if (reward) return false;
    return true;
  } catch (error) {
    console.log(error);
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
    console.log("is reward exists :", reward);

    if (reward) return false;
    return true;
  } catch (error) {
    console.log(error);
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
    console.log(error);
    return false;
  }
};

export const validateCheckinReward = async (user: IUser, checkin: ICheckIn) => {
  try {
    // check if the user has already been rewarded for the comment
    const existingRewards = await Reward.find({
      userId: user._id,
      "reason.refType": "Checkin",
      "reason.placeId": checkin.place,
    });

    if (existingRewards.length >= thresholds.MAX_CHECKIN_PER_PLACE)
      return false;
    return true;
  } catch (error) {
    console.log(error);
    return false;
  }
};
