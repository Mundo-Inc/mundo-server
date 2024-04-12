import moment from "moment-timezone";
import tzlookup from "tz-lookup";

import Achievement, {
  AchievementTypeEnum,
  type IAchievement,
} from "../../../../models/Achievement";
import CheckIn from "../../../../models/CheckIn";
import Reaction from "../../../../models/Reaction";
import Review from "../../../../models/Review";
import User from "../../../../models/User";
import logger from "../../logger";
import { thresholds } from "../utils/threshold";

export const eligibleForAchivement = async (
  userId: string,
  AchievementType: string
) => {
  try {
    const user = await User.findById(userId).populate("progress.achievements");
    if (!user.progress.achievements) user.progress.achievements = [];
    logger.verbose("CheckIn eligibility for " + AchievementType);
    switch (AchievementType) {
      case AchievementTypeEnum.ROOKIE_REVIEWER:
        if (
          !user.progress.achievements.find(
            (a: IAchievement) => a.type === AchievementTypeEnum.ROOKIE_REVIEWER
          )
        ) {
          const newAchivement = await Achievement.create({
            userId: userId,
            type: AchievementTypeEnum.ROOKIE_REVIEWER,
          });
          await newAchivement.save();
          return newAchivement;
        }
        break;

      case AchievementTypeEnum.CRITIC_ON_THE_RISE:
        if (
          !user.progress.achievements.find(
            (a: IAchievement) =>
              a.type === AchievementTypeEnum.CRITIC_ON_THE_RISE
          )
        ) {
          //check if user has 5 reviews
          const userReviewsCount = await Review.countDocuments({
            writer: userId,
          });
          if (userReviewsCount >= 5) {
            const newAchivement = await Achievement.create({
              userId: userId,
              type: AchievementTypeEnum.CRITIC_ON_THE_RISE,
            });
            await newAchivement.save();
            return newAchivement;
          }
        }
        break;

      case AchievementTypeEnum.PAPARAZZI_PRO:
        if (
          !user.progress.achievements.find(
            (a: IAchievement) => a.type === AchievementTypeEnum.PAPARAZZI_PRO
          )
        ) {
          //check if user has 5 reviews containing photos or videos (media)
          const userReviewsCountContainingMedia = await Review.countDocuments({
            writer: userId,
            $or: [
              { photos: { $exists: true, $ne: [] } },
              { videos: { $exists: true, $ne: [] } },
            ],
          });
          if (userReviewsCountContainingMedia >= 5) {
            const newAchivement = await Achievement.create({
              userId: userId,
              type: AchievementTypeEnum.PAPARAZZI_PRO,
            });
            await newAchivement.save();
            return newAchivement;
          }
        }
        break;

      case AchievementTypeEnum.CHECK_CHECK:
        //check how many achivements user has with type CHECK_CHECK in the last week (createdAt)
        const checkCheckAchivementInLastWeek =
          user.progress.achievements.filter(
            (a: IAchievement) =>
              a.type === AchievementTypeEnum.CHECK_CHECK &&
              a.createdAt &&
              a.createdAt.getTime() >
                new Date().getTime() - 7 * 24 * 60 * 60 * 1000
          ).length;

        const userCheckInsCountInLastWeek = await CheckIn.countDocuments({
          user: userId,
          createdAt: { $gt: new Date().getTime() - 7 * 24 * 60 * 60 * 1000 },
        });

        if (
          checkCheckAchivementInLastWeek === 0 &&
          userCheckInsCountInLastWeek >= 5
        ) {
          const newAchivement = await Achievement.create({
            userId: userId,
            type: AchievementTypeEnum.CHECK_CHECK,
          });
          return await newAchivement.save();
        }
        break;

      case AchievementTypeEnum.REACT_ROLL:
        //check how many achivements user has with type CHECK_CHECK in the last week (createdAt)
        const reactRollAchivementsCount = user.progress.achievements.filter(
          (a: IAchievement) => a.type === AchievementTypeEnum.REACT_ROLL
        ).length;

        const userReactsCount = await Reaction.countDocuments({
          user: userId,
        });

        if (
          Math.floor(userReactsCount / thresholds.REACT_ROLL_THRESHOLD) >=
          reactRollAchivementsCount
        ) {
          const newAchivement = await Achievement.create({
            userId: userId,
            type: AchievementTypeEnum.REACT_ROLL,
          });
          return await newAchivement.save();
        }
        break;

      case AchievementTypeEnum.EARLY_BIRD:
        //check how many achivements user has with type CHECK_CHECK in the last week (createdAt)
        const earlyBirdAchivementInLast12hrs =
          user.progress.achievements.filter(
            (a: IAchievement) =>
              a.type === AchievementTypeEnum.EARLY_BIRD &&
              a.createdAt &&
              a.createdAt.getTime() > new Date().getTime() - 12 * 60 * 60 * 1000
          ).length;

        const usersLatestCheckIn = await CheckIn.findOne({
          user: userId,
        })
          .sort({ createdAt: -1 })
          .populate("place");
        if (earlyBirdAchivementInLast12hrs === 0 && usersLatestCheckIn) {
          const placeTimezone = tzlookup(
            usersLatestCheckIn.place.location.geoLocation.coordinates[1],
            usersLatestCheckIn.place.location.geoLocation.coordinates[0]
          );
          const currentTimeInPlace = moment().tz(placeTimezone);

          if (currentTimeInPlace.hour() < 9 && currentTimeInPlace.hour() > 4) {
            const newAchivement = await Achievement.create({
              userId: userId,
              type: AchievementTypeEnum.EARLY_BIRD,
            });
            return await newAchivement.save();
          }
        }
        break;

      case AchievementTypeEnum.NIGHT_OWL:
        //check how many achivements user has with type CHECK_CHECK in the last week (createdAt)
        const nightOwlAchivementInLast12hrs = user.progress.achievements.filter(
          (a: IAchievement) =>
            a.type === AchievementTypeEnum.NIGHT_OWL &&
            a.createdAt &&
            a.createdAt.getTime() > new Date().getTime() - 12 * 60 * 60 * 1000
        ).length;

        const usersLatestCheckIn_ = await CheckIn.findOne({
          user: userId,
        })
          .sort({ createdAt: -1 })
          .populate("place");
        if (nightOwlAchivementInLast12hrs === 0 && usersLatestCheckIn_) {
          const placeTimezone = tzlookup(
            usersLatestCheckIn_.place.location.geoLocation.coordinates[1],
            usersLatestCheckIn_.place.location.geoLocation.coordinates[0]
          );
          const currentTimeInPlace = moment().tz(placeTimezone);
          if (currentTimeInPlace.hour() > 21 && currentTimeInPlace.hour() < 3) {
            const newAchivement = await Achievement.create({
              userId: userId,
              type: AchievementTypeEnum.NIGHT_OWL,
            });
            return await newAchivement.save();
          }
        }
        break;

      default:
        break;
    }
    return;
  } catch (error) {
    logger.error("Error while checking achievement eligibility", { error });
    throw error;
  }
};
