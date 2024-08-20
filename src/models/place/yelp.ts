import { Schema } from "mongoose";

export interface IYelp {
  _id?: string;
  rating?: number;
  updatedAt?: Date;
}

export const YelpSchema = new Schema<IYelp>({
  _id: String,
  rating: Number,
  updatedAt: Date,
});
