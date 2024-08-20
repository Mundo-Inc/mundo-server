import { Schema } from "mongoose";

export interface IAppleMaps {
  _id?: string;
  updatedAt?: Date;
}

export const AppleMapsSchema = new Schema<IAppleMaps>({
  _id: String,
  updatedAt: Date,
});
