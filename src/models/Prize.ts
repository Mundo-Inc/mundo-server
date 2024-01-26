import mongoose, { Schema, Document } from "mongoose";

export interface IPrize extends Document {
  title: string;
  thumbnail: string;
  amount: number;
  count?: number;
  createdAt: Date;
}

const PrizeSchema: Schema = new Schema<IPrize>({
  title: { type: String, required: true },
  thumbnail: { type: String, required: true },
  amount: { type: Number, required: true },
  count: { type: Number, required: false },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Prize ||
  mongoose.model<IPrize>("Prize", PrizeSchema);
