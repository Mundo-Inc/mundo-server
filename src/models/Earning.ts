import mongoose, { Schema, type Model } from "mongoose";

export enum EarningTypeEnum {
  Place = "Place",
  Review = "Review",
  CheckIn = "CheckIn",
}

export interface IEarning {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  earningType: String;
  earning: mongoose.Types.ObjectId;
  coins: Number;
  createdAt: Date;
}

const EarningSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  earningType: {
    type: String,
    required: true,
    enum: Object.values(EarningTypeEnum),
  },
  earning: {
    type: Schema.Types.ObjectId,
    required: true,
    index: true,
    refPath: "earningType",
  },
  coins: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

const model =
  (mongoose.models.Earning as Model<IEarning>) ||
  mongoose.model<IEarning>("Earning", EarningSchema);

export default model;
