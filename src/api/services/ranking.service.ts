import User from "../../models/User";
import UserActivity, {
  ActivityPrivacyTypeEnum,
  ActivityTypeEnum,
  ResourceTypeEnum,
} from "../../models/UserActivity";

export const getRemainingXpToNextLevel = (xp: number): number => {
  let remainingXp = 0;
  if (xp >= 0 && xp < 100) remainingXp = 100 - xp;
  else if (xp >= 100 && xp < 300) remainingXp = 300 - xp;
  else if (xp >= 300 && xp < 600) remainingXp = 600 - xp;
  else if (xp >= 600 && xp < 1000) remainingXp = 1000 - xp;
  else if (xp >= 1000 && xp < 1500) remainingXp = 1500 - xp;
  else if (xp >= 1500 && xp < 2100) remainingXp = 2100 - xp;
  else if (xp >= 2100) remainingXp = 0;
  return remainingXp;
};

export const getUserLevelByExperince = (xp: number): number => {
  let level = 0;
  if (xp >= 0 && xp < 100) level = 1;
  else if (xp >= 100 && xp < 300) level = 2;
  else if (xp >= 300 && xp < 600) level = 3;
  else if (xp >= 600 && xp < 1000) level = 4;
  else if (xp >= 1000 && xp < 1500) level = 5;
  else if (xp >= 1500 && xp < 2100) level = 6;
  else if (xp >= 2100) level = 7;
  return level;
};

const computeUserLevel = async (
  userId: string,
  totalXp: number,
  currentLevel: number
) => {
  const newLevel = getUserLevelByExperince(totalXp);
  if (newLevel > currentLevel) {
    await UserActivity.create({
      userId,
      activityType: ActivityTypeEnum.LEVEL_UP,
      resourceType: ResourceTypeEnum.USER,
      resourceId: userId,
      privacyType: ActivityPrivacyTypeEnum.PUBLIC,
    });
  }
  await User.updateOne(
    { _id: userId },
    {
      xp: totalXp,
      level: newLevel,
    }
  );
};

export const addCreatePlaceXP = async (userId: string) => {
  const user = await User.findById(userId);
  const totalXp = user.xp + 10;
  await computeUserLevel(userId, totalXp, user.level);
};

export const addCreateCheckinXP = async (userId: string) => {
  const user = await User.findById(userId);
  const checkinActivities = await UserActivity.find({
    userId,
    activityType: ActivityTypeEnum.NEW_CHECKIN,
  });
  const n = checkinActivities.length;
  const totalXp = user.xp + Math.ceil(20 / (n + 1));
  await computeUserLevel(userId, totalXp, user.level);
};

export const addCreateDealXP = async (userId: string) => {
  const user = await User.findById(userId);
  const dealActivities = await UserActivity.find({
    userId,
    activityType: ActivityTypeEnum.CREATE_DEAL,
  });
  const n = dealActivities.length;
  const totalXp = user.xp + Math.ceil(10 / (n + 1));
  await computeUserLevel(userId, totalXp, user.level);
};

export const addCreateReactionXP = async (userId: string) => {
  const user = await User.findById(userId);
  const totalXp = user.xp + 1;
  await computeUserLevel(userId, totalXp, user.level);
};

export const addCreateCommentXP = async (userId: string) => {
  const user = await User.findById(userId);
  const totalXp = user.xp + 2;
  await computeUserLevel(userId, totalXp, user.level);
};

export const addCreateReviewXP = async (
  userId: string,
  images: string[],
  videos: string[]
) => {
  const user = await User.findById(userId);
  let totalXp = user.xp + 2;
  if (images) totalXp += 10;
  if (videos) totalXp += 20;
  await computeUserLevel(userId, totalXp, user.level);
};

export const addCreateRecommendXP = async (
  userId: string,
  recommend: boolean
) => {
  const user = await User.findById(userId);
  let totalXp = user.xp + 2;
  if (recommend) totalXp += 10;
  else totalXp += 0;
  await computeUserLevel(userId, totalXp, user.level);
};

export const addNewFollowingXP = async (userId: string) => {
  const user = await User.findById(userId);
  let totalXp = user.xp + 10;
  await computeUserLevel(userId, totalXp, user.level);
};
