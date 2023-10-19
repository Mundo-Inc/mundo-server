import Reaction, { IReaction } from "../../../../models/Reaction";
import Review, { IReview } from "../../../../models/Review";
import Reward from "../../../../models/Reward";
import { IUser } from "../../../../models/User";
import { thresholds } from "../utils/threshold";

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
    // check how many time the user has reviewed the place
    const userReactionCount = await Reaction.countDocuments({
      user: user._id,
      target: reaction.target,
    });
    if (thresholds.MAX_REACTION_PER_POST <= userReactionCount) return false;
    // check if the user has already been rewarded for the review
    const reward = await Reward.findOne({
      userId: user._id,
      reason: {
        refType: "Reaction",
        refId: reaction._id,
      },
    });
    if (reward) return false;
    return true;
  } catch (error) {
    console.log(error);
    return false;
  }
};
