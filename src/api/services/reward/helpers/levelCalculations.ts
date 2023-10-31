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

export const calcRemainingXP = (currentXP: number): number => {
  const currentLevel = calcLevel(currentXP);
  const nextLevel = currentLevel + 1;

  // If the user is already at or above level 100, calculate remaining XP based on a flat rate of 500 XP per level
  if (currentLevel >= 100) {
    return (
      500 -
      ((currentXP - level_thresholds[100] - (currentLevel - 100) * 500) % 500)
    );
  }

  // If the user's level is not directly defined in the thresholds, calculate it linearly
  const lowerLevel = Math.floor(currentLevel / 10) * 10;
  const upperLevel = lowerLevel + 10;
  const lowerThreshold = level_thresholds[lowerLevel] || 0;
  const upperThreshold = level_thresholds[upperLevel];

  if (upperThreshold === undefined) {
    throw new Error(`XP threshold for level ${upperLevel} is not defined.`);
  }

  const xpPerLevel =
    (upperThreshold - lowerThreshold) / (upperLevel - lowerLevel);
  const remainingXP = xpPerLevel - ((currentXP - lowerThreshold) % xpPerLevel);

  return remainingXP;
};
