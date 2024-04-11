import mongoose, { Schema, type Document } from "mongoose";

export enum PrizeRedemptionStatusTypeEnum {
  PENDING = "PENDING",
  DECLINED = "DECLINED",
  SUCCESSFUL = "SUCCESSFUL",
}

export interface IPrizeRedemption extends Document {
  userId: mongoose.Types.ObjectId;
  prizeId: mongoose.Types.ObjectId;
  status: PrizeRedemptionStatusTypeEnum;
  note?: String;
  createdAt: Date;
  updatedAt: Date;
}

const PrizeRedemptionSchema: Schema = new Schema<IPrizeRedemption>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    prizeId: { type: Schema.Types.ObjectId, ref: "Prize" },
    status: {
      type: String,
      enum: Object.values(PrizeRedemptionStatusTypeEnum),
      default: PrizeRedemptionStatusTypeEnum.PENDING,
    },
    note: {
      type: String,
      default: "",
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.PrizeRedemption ||
  mongoose.model<IPrizeRedemption>("PrizeRedemption", PrizeRedemptionSchema);
