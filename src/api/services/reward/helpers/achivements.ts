import Achievement, { IAchievement } from "../../../../models/Achievement";
import { IUser } from "../../../../models/User";

type LevelupAcivement = {
  [key: number]: string;
};

export const levelup_achivements: LevelupAcivement = {
  0: "WELCOME",
  10: "STARTER",
  20: "EXPLORER",
  30: "CRITIC",
  40: "ADVENTURER",
  50: "SOCIALITE",
  60: "INFLUENCER",
  70: "ELITE",
  80: "AMBASSADOR",
  90: "MASTEREXPLORER",
  100: "LEGEND",
};

export const checkNewLevelupAchivements = async (
  user: IUser,
  oldLevel: number,
  currentLevel: number
) => {
  try {
    // List of newly unlocked achievements
    const newAchievements: IAchievement[] = [];
    // Iterate through the achievements and check which ones were unlocked
    for (let level in levelup_achivements) {
      const achievementLevel = parseInt(level);
      if (oldLevel < achievementLevel && currentLevel >= achievementLevel) {
        // Achievement was unlocked
        const achivement = await Achievement.create({
          userId: user._id,
          type: levelup_achivements[achievementLevel],
        });
        await achivement.save();
        newAchievements.push(achivement);
      }
    }
    // If any new achievements were unlocked, add them to the user's achievements and save
    if (newAchievements.length > 0) {
      if (!user.progress.achievements) user.progress.achievements = [];
      user.progress.achievements.push();
      // Assuming the IUser has a save method or you can replace this with your database save/update method
      await user.save();
    }
    return newAchievements; // Optionally, return the new achievements so you can notify the user or do something else with this info
  } catch (error) {
    console.log(error);
    return [];
  }
};
