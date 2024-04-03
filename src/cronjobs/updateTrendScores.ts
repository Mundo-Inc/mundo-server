import cron from "node-cron";

import logger from "../api/services/logger";
import UserActivity from "../models/UserActivity";

interface Query {
  hasMedia: boolean;
  createdAt?: {
    $gt?: Date;
    $lt?: Date;
  };
}

async function updateHotnessScores(
  before: Date | undefined,
  after: Date | undefined
) {
  const query: Query = { hasMedia: true };
  if (after) {
    query.createdAt = { ...query.createdAt, $gt: after };
  }
  if (before) {
    query.createdAt = { ...query.createdAt, $lt: before };
  }

  const activities = await UserActivity.find(query);
  try {
    for (const activity of activities) {
      const hotnessScore = await activity.calculateHotnessScore();
      activity.hotnessScore = hotnessScore;
      await activity.save();
    }
  } catch (error) {
    logger.error("error while updating hotness scores", error);
  }
}
const now = new Date();
const lastMonth = new Date(now.getTime() - 4 * 7 * 24 * 60 * 60 * 1000);
logger.verbose("Hotness scores updated (since last month)");
updateHotnessScores(now, lastMonth);

cron.schedule("*/5 * * * *", async () => {
  const now = new Date();
  const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  await updateHotnessScores(now, last24Hours);
});

cron.schedule("0 * * * *", async () => {
  const now = new Date();
  const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  await updateHotnessScores(last24Hours, undefined);
});
