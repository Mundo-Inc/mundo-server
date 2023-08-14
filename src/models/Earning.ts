import mongoose, { Schema, type Document } from "mongoose";

export enum EarningTypeEnum {
  Place = "Place",
  Review = "Review",
  Checkin = "Checkin",
  Deal = "Deal",
}

export interface IEarning extends Document {
  userId: mongoose.Types.ObjectId;
  earningType: String;
  earning: mongoose.Types.ObjectId;
  coins: Number;
  createdAt: Date;
}

const EarningSchema: Schema = new Schema({
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

export default mongoose.models.Earning ||
  mongoose.model<IEarning>("Earning", EarningSchema);
