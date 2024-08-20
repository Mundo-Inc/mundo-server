import { Schema } from "mongoose";

export interface IScores {
  overall: number;
  drinkQuality: number;
  foodQuality: number;
  atmosphere: number;
  service: number;
  value: number;
  phantom: number;
  updatedAt: Date;
}

export const ScoresSchema = new Schema<IScores>(
  {
    overall: { type: Number, min: 0, max: 5 },
    drinkQuality: { type: Number, min: 0, max: 5 },
    foodQuality: { type: Number, min: 0, max: 5 },
    atmosphere: { type: Number, min: 0, max: 5 },
    service: { type: Number, min: 0, max: 5 },
    value: { type: Number, min: 0, max: 5 },
    phantom: { type: Number },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);
