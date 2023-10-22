import mongoose, { Schema, Document } from "mongoose";

// Define the achievement types as string literals
export enum AchievementTypeEnum {
  WELCOME = "Welcome",
  STARTER = "Starter",
  EXPLORER = "Explorer",
  CRITIC = "Critic",
  ADVENTURER = "Adventurer",
  SOCIALITE = "Socialite",
  INFLUENCER = "Influencer",
  ELITE = "Elite",
  AMBASSADOR = "Ambassador",
  MASTEREXPLORER = "Master Explorer",
  LEGEND = "Legend",

  /// ... add more achievement types as needed
  NIGHT_OWL = "Night Owl",
  EARLY_BIRD = "Early Bird",
  ROOKIE_REVIEWER = "Rookie Reviewer",
  CRITIC_ON_THE_RISE = "Critic on the Rise",
  CHECK_CHECK = "Check Check",
  QUESTION_MASTER = "Question Master",
  REACT_ROLL = "React & Roll",
  BETA_PIONEER = "Beta Pioneer",
  WORLD_DOMINATOR = "World Dominator",
  WEEKEND_WANDERLUST = "Weekend Wanderlust",
  PAPARAZZI_PRO = "Paparazzi Pro",
  POLL_TAKER = "Poll Taker",
  // ... add more achievement types as needed
}

export interface IAchievement extends Document {
  userId: mongoose.Types.ObjectId;
  type: AchievementTypeEnum;
  createdAt?: Date;
  updatedAt?: Date;
}

const AchievementSchema: Schema = new Schema<IAchievement>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: Object.values(AchievementTypeEnum),
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.models.Achievement ||
  mongoose.model<IAchievement>("Achievement", AchievementSchema);
