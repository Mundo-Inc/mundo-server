import mongoose, { Schema, type Model } from "mongoose";

export enum CoinRewardTypeEnum {
  daily = "DAILY",
  mission = "MISSION",
  referral = "REFERRAL",
}

export interface ICoinReward {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  amount: number;
  coinRewardType: string;
  missionId?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const CoinRewardSchema = new Schema<ICoinReward>({
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

const model =
  (mongoose.models.CoinReward as Model<ICoinReward>) ||
  mongoose.model<ICoinReward>("CoinReward", CoinRewardSchema);

export default model;
