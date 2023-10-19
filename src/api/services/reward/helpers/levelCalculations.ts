import { IReview } from "../../../../models/Review";
import { level_thresholds } from "../utils/levelupThresholds";
import { rewards_amounts } from "../utils/rewardsAmounts";

export const calcLevel = (xp: number) => {
  let lastLevel = 1;
  let lastXP = level_thresholds[lastLevel];

  for (let [levelString, threshold] of Object.entries(level_thresholds)) {
    const level = parseInt(levelString); // Convert the string key back to a number
    if (xp < threshold) {
      // Calculate intermediate levels
      const xpBetweenLevels = threshold - lastXP;
      const levelsBetween = level - lastLevel;
      const xpPerLevel = xpBetweenLevels / levelsBetween;

      return lastLevel + Math.floor((xp - lastXP) / xpPerLevel);
    }
    lastLevel = level;
    lastXP = threshold;
  }
  // After level 100
  return 100 + Math.floor((xp - lastXP) / 500);
};

export function calcReviewReward(review: IReview) {
  let amt = 0;
  if (review.scores && review.scores.overall)
    amt += rewards_amounts.REVIEW.HAS_RATING;
  if (review.recommend) amt += rewards_amounts.REVIEW.HAS_RECOMMENDATION;
  if (review.content) amt += rewards_amounts.REVIEW.HAS_TEXT;
  if (review.images && review.images.length > 0)
    amt += rewards_amounts.REVIEW.HAS_IMAGES;
  if (review.videos && review.videos.length > 0)
    amt += rewards_amounts.REVIEW.HAS_VIDEOS;
  return amt;
}
