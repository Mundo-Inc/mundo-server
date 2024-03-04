import mongoose, { Schema, type Document } from "mongoose";

// Define the achievement types as string literals
export enum AchievementTypeEnum {
  WELCOME = "WELCOME",
  STARTER = "STARTER",
  EXPLORER = "EXPLORER",
  CRITIC = "CRITIC",
  ADVENTURER = "ADVENTURER",
  SOCIALITE = "SOCIALITE",
  INFLUENCER = "INFLUENCER",
  ELITE = "ELITE",
  AMBASSADOR = "AMBASSADOR",
  MASTEREXPLORER = "MASTEREXPLORER",
  LEGEND = "LEGEND",

  /// ... add more achievement types as needed
  NIGHT_OWL = "NIGHT_OWL",
  EARLY_BIRD = "EARLY_BIRD",
  ROOKIE_REVIEWER = "ROOKIE_REVIEWER",
  CRITIC_ON_THE_RISE = "CRITIC_ON_THE_RISE",
  CHECK_CHECK = "CHECK_CHECK",
  QUESTION_MASTER = "QUESTION_MASTER",
  REACT_ROLL = "REACT_ROLL",
  BETA_PIONEER = "BETA_PIONEER",
  WORLD_DOMINATOR = "WORLD_DOMINATOR",
  WEEKEND_WANDERLUST = "WEEKEND_WANDERLUST",
  PAPARAZZI_PRO = "PAPARAZZI_PRO",
  POLL_TAKER = "POLL_TAKER",
  // ... add more achievement types as needed
}

export interface IAchievement extends Document {
  userId: mongoose.Types.ObjectId;
  type: AchievementTypeEnum;
  createdAt: Date;
}

const AchievementSchema: Schema = new Schema<IAchievement>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  type: {
    type: String,
    enum: Object.values(AchievementTypeEnum),
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.models.Achievement ||
  mongoose.model<IAchievement>("Achievement", AchievementSchema);
