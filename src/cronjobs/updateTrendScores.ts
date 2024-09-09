import type { RootFilterQuery } from "mongoose";
import cron from "node-cron";

import logger from "../api/services/logger/index.js";
import UserActivity, { type IUserActivity } from "../models/userActivity.js";

interface Query {
  hasMedia: boolean;
  createdAt?: {
    $gt?: Date;
    $lt?: Date;
  };
}

async function updateHotnessScores(
  before: Date | undefined,
  after: Date | undefined,
) {
  const query: RootFilterQuery<IUserActivity> = { hasMedia: true };
  if (after) {
    query.createdAt = { ...query.createdAt, $gt: after };
  }
  if (before) {
    query.createdAt = { ...query.createdAt, $lt: before };
  }

  const activities = await UserActivity.find(query);

  for (const activity of activities) {
    try {
      const hotnessScore = await activity.calculateHotnessScore();
      activity.hotnessScore = hotnessScore;
      await activity.save();
    } catch (error) {
      logger.error("error while updating hotness scores", error);
    }
  }
}

cron.schedule("*/5 * * * *", async () => {
  const now = new Date();
  const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  await updateHotnessScores(now, last24Hours);
  logger.verbose("Updated hotness scores for last 24 hours");
});

cron.schedule("0 * * * *", async () => {
  const now = new Date();
  const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  await updateHotnessScores(last24Hours, undefined);
  logger.verbose("Updated hotness scores for activity older than 24 hours");
});
