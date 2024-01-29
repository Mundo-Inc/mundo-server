import mongoose, { Schema, Document } from "mongoose";

export enum PrizeRedemptionStatusType {
  PENDING = "PENDING",
  DECLINED = "DECLINED",
  SUCCESSFUL = "SUCCESSFUL",
}

export interface IPrizeRedemption extends Document {
  userId: mongoose.Types.ObjectId;
  prizeId: mongoose.Types.ObjectId;
  status: PrizeRedemptionStatusType;
  createdAt: Date;
  updatedAt: Date;
}

const PrizeRedemptionSchema: Schema = new Schema<IPrizeRedemption>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "user" },
    prizeId: { type: Schema.Types.ObjectId, ref: "Prize" },
    status: {
      type: String,
      enum: Object.values(PrizeRedemptionStatusType),
      default: PrizeRedemptionStatusType.PENDING,
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.PrizeRedemption ||
  mongoose.model<IPrizeRedemption>("PrizeRedemption", PrizeRedemptionSchema);
