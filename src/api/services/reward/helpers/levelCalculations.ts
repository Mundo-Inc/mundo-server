import { IReview } from "../../../../models/Review";
import { getLevelThresholds } from "../utils/levelupThresholds";
import { rewards_amounts } from "../utils/rewardsAmounts";

export const calcLevel = (xp: number) => {
  const thresholds = getLevelThresholds();
  let level = 1;
  // Loop through the thresholds to find the current level based on XP
  for (let i = 1; i <= 100; i++) {
    if (xp < thresholds[i]) {
      level = i - 1;
      break;
    } else if (xp === thresholds[i]) {
      level = i;
      break;
    }
  }
  // Handle XP amounts greater than the threshold for level 100
  if (xp > thresholds[100]) {
    level = 100 + Math.floor((xp - thresholds[100]) / 500);
  }

  return level;
};

export const calcRemainingXP = (currentXP: number): number => {
  const currentLevel = calcLevel(currentXP);

  if (currentLevel >= 100) {
    const xpOverLevel100 = currentXP - getLevelThresholds()[100];
    const remainingXP = 500 - (xpOverLevel100 % 500);
    return remainingXP;
  }

  const nextLevelThreshold = getLevelThresholds()[currentLevel + 1];
  if (nextLevelThreshold === undefined) {
    throw new Error(
      `XP threshold for level ${currentLevel + 1} is not defined.`
    );
  }

  const remainingXP = nextLevelThreshold - currentXP;
  return remainingXP;
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
