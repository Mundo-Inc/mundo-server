import mongoose, { Schema, type Document } from "mongoose";

export enum AchievementTypeEnum {
  LEVEL_UP = "LEVEL_UP",
  GOT_BADGE = "GOT_BADGE",
}

export interface IAchievement extends Document {
  userId: mongoose.Types.ObjectId;
  achievementType: AchievementTypeEnum;
  createdAt: Date;
}

const AchievementSchema: Schema = new Schema<IAchievement>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    achievementType: {
      type: String,
      required: true,
      enum: Object.values(AchievementTypeEnum),
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export default mongoose.models.Achievement ||
  mongoose.model<IAchievement>("Achievement", AchievementSchema);
