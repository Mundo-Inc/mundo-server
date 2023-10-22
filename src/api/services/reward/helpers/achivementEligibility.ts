import Achievement, {
  AchievementTypeEnum,
  IAchievement,
} from "../../../../models/Achievement";
import CheckIn from "../../../../models/CheckIn";
import Review from "../../../../models/Review";
import User from "../../../../models/User";

export const eligibleForAchivement = async (
  userId: string,
  AchievementType: AchievementTypeEnum
) => {
  try {
    const user = await User.findById(userId).populate("progress.achievements");
    if (!user.progress.achievements) user.progress.achievements = [];

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

        const userCheckinsCountInLastWeek = await CheckIn.countDocuments({
          user: userId,
          createdAt: { $gt: new Date().getTime() - 7 * 24 * 60 * 60 * 1000 },
        });

        console.log(userCheckinsCountInLastWeek);

        if (
          checkCheckAchivementInLastWeek === 0 &&
          userCheckinsCountInLastWeek >= 5
        ) {
          console.log("eligibleForAchivement");

          const newAchivement = await Achievement.create({
            userId: userId,
            type: AchievementTypeEnum.CHECK_CHECK,
          });
          console.log("xxxxx");

          console.log(newAchivement);
          return await newAchivement.save();
        }
        break;

      default:
        break;
    }
    return;
  } catch (error) {
    console.log(error);
  }
};
