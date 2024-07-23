import { StatusCodes } from "http-status-codes";

import { MediaTypeEnum } from "../../../../models/Media.js";
import type { IReview } from "../../../../models/Review.js";
import { createError } from "../../../../utilities/errorHandlers.js";
import { type MediaProjectionBrief } from "../../../dto/media.js";
import { getLevelThresholds } from "../utils/levelupThresholds.js";
import { rewards_amounts } from "../utils/rewardsAmounts.js";

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
    throw createError(
      `XP threshold for level ${currentLevel + 1} is not defined.`,
      StatusCodes.INTERNAL_SERVER_ERROR,
    );
  }

  const remainingXP = nextLevelThreshold - currentXP;
  return remainingXP;
};

export function calcReviewReward(
  review: IReview,
  media: MediaProjectionBrief[],
) {
  let amt = 0;

  if (review.scores && review.scores.overall) {
    amt += rewards_amounts.REVIEW.HAS_RATING;
  }
  if (review.recommend) {
    amt += rewards_amounts.REVIEW.HAS_RECOMMENDATION;
  }
  if (review.content) {
    amt += rewards_amounts.REVIEW.HAS_TEXT;
  }
  if (media && media.length > 0) {
    if (media.some((m) => m.type === MediaTypeEnum.Image)) {
      amt += rewards_amounts.REVIEW.HAS_IMAGES;
    }
    if (media.some((m) => m.type === MediaTypeEnum.Video)) {
      amt += rewards_amounts.REVIEW.HAS_VIDEOS;
    }
  }

  return amt;
}
