import mongoose, { Schema, type Model } from "mongoose";

export enum PrizeRedemptionStatusTypeEnum {
  PENDING = "PENDING",
  DECLINED = "DECLINED",
  SUCCESSFUL = "SUCCESSFUL",
}

export interface IPrizeRedemption {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  prizeId: mongoose.Types.ObjectId;
  status: PrizeRedemptionStatusTypeEnum;
  note?: String;
  createdAt: Date;
  updatedAt: Date;
}

const PrizeRedemptionSchema = new Schema<IPrizeRedemption>(
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

const PrizeRedemption =
  (mongoose.models.PrizeRedemption as Model<IPrizeRedemption>) ||
  mongoose.model<IPrizeRedemption>("PrizeRedemption", PrizeRedemptionSchema);

export default PrizeRedemption;
