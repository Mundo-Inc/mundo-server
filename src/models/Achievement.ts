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
  // ... add more achievement types as needed
}

export interface IAchievement extends Document {
  userId: mongoose.Types.ObjectId;
  type: AchievementTypeEnum;
}

const AchievementSchema: Schema = new Schema<IAchievement>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: Object.keys(AchievementTypeEnum),
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.models.Achievement ||
  mongoose.model<IAchievement>("Achievement", AchievementSchema);
