import mongoose, { Schema, type Model } from "mongoose";

export interface IProfileFrame {
  _id: mongoose.Types.ObjectId;
  name: string;
  url: string;
  price: number;
  createdAt: Date;
}

export interface IProfileCover {
  _id: mongoose.Types.ObjectId;
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
  (mongoose.models.ProfileFrame as Model<IProfileFrame>) ||
  mongoose.model<IProfileFrame>("ProfileFrame", profileFrameSchema);

export const ProfileCover =
  (mongoose.models.ProfileCover as Model<IProfileCover>) ||
  mongoose.model<IProfileCover>("ProfileCover", profileCoverSchema);
