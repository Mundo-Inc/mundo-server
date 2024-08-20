import mongoose, { Schema, type Model } from "mongoose";

export interface IPrize {
  _id: mongoose.Types.ObjectId;
  title: string;
  thumbnail: string;
  amount: number;
  count: number;
  createdAt: Date;
}

const PrizeSchema = new Schema<IPrize>({
  title: { type: String, required: true },
  thumbnail: { type: String, required: true },
  amount: { type: Number, required: true },
  count: { type: Number, required: false },
  createdAt: { type: Date, default: Date.now },
});

const Prize =
  (mongoose.models.Prize as Model<IPrize>) ||
  mongoose.model<IPrize>("Prize", PrizeSchema);

export default Prize;
