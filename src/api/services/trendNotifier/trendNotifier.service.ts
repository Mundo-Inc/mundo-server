import CheckIn from "../../../models/CheckIn";
import Follow from "../../../models/Follow";
import Review from "../../../models/Review";
import logger from "../logger";
import { thresholds } from "../reward/utils/threshold";

function getPreviousDate(hours: number) {
  var now = new Date();
  now.setHours(now.getHours() - hours);
  return now;
}
export const trendNotifier = async (place: string) => {
  try {
    const reviews = await Review.find({
      place: place,
      createdAt: { $gte: getPreviousDate(thresholds.TREND_HOURS_THRESHOLD) },
    }).lean();
    const checkins = await CheckIn.find({
      place: place,
      createdAt: { $gte: getPreviousDate(thresholds.TREND_HOURS_THRESHOLD) },
    }).lean();
    const reviewedByIds = reviews.map((r) => r.writer);
    const checkedInByIds = checkins.map((c) => c.user);

    const activitiesByIds = [...new Set([...reviewedByIds, ...checkedInByIds])];

    // Find users who follow at least 'trend.TREND_MIN_FOLLOWING_ACTIVITY' of these people in activitiesByIds
    const userCircle = await Follow.aggregate([
      {
        $match: {
          target: { $in: activitiesByIds },
        },
      },
      {
        $group: {
          _id: "$user",
          followingCount: { $sum: 1 },
        },
      },
      {
        $match: {
          followingCount: { $gte: thresholds.TREND_MIN_FOLLOWING_ACTIVITY },
        },
      },
    ]);

    //TODO: SEND NOTIFS
  } catch (error) {
    // throw error;
    logger.error(
      "Error checking circle for sending trend place notification",
      error
    );
  }
};
