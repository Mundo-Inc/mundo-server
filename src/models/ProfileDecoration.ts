import mongoose, { Schema, type Document } from "mongoose";

export interface IProfileFrame extends Document {
  name: string;
  url: string;
  price: number;
  createdAt: Date;
}

export interface IProfileCover extends Document {
  name: string;
  url: string;
  price: number;
  createdAt: Date;
}

const profileFrameSchema = new Schema<IProfileFrame>({
  name: { type: String, required: true },
  url: { type: String, required: true },
  price: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

const profileCoverSchema = new Schema<IProfileCover>({
  name: { type: String, required: true },
  url: { type: String, required: true },
  price: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const ProfileFrame =
  mongoose.models.ProfileFrame ||
  mongoose.model<IProfileFrame>("ProfileFrame", profileFrameSchema);
export const ProfileCover =
  mongoose.models.ProfileCover ||
  mongoose.model<IProfileCover>("ProfileCover", profileCoverSchema);

// module.exports = { ProfileFrame, ProfileCover };
