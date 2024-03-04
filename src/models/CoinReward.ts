import mongoose, { Schema, type Document } from "mongoose";

export enum CoinRewardTypeEnum {
  daily = "DAILY",
  mission = "MISSION",
  referral = "REFERRAL",
}

export interface ICoinReward extends Document {
  userId: mongoose.Types.ObjectId;
  amount: number;
  coinRewardType: string;
  missionId?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const CoinRewardSchema: Schema = new Schema<ICoinReward>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  amount: { type: Number, required: true },
  coinRewardType: {
    type: String,
    enum: Object.values(CoinRewardTypeEnum),
    required: true,
  },
  missionId: {
    type: Schema.Types.ObjectId,
    ref: "Mission",
    required: false,
  },
  createdAt: { type: Date, default: Date.now },
});

CoinRewardSchema.index({ userId: 1 });

export default mongoose.models.CoinReward ||
  mongoose.model<ICoinReward>("CoinReward", CoinRewardSchema);
