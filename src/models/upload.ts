import mongoose, { Schema, type Model } from "mongoose";

import { MediaTypeEnum } from "./media.js";

export type UploadUsecase = "profileImage" | "placeReview" | "checkin";

export interface IUpload {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  key: string;
  src: string;
  type: MediaTypeEnum;
  usecase: UploadUsecase;
  createdAt: Date;
}

const UploadSchema = new Schema<IUpload>({
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  key: {
    type: String,
    required: true,
  },
  src: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: Object.values(MediaTypeEnum),
    required: true,
  },
  usecase: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Upload =
  (mongoose.models.Upload as Model<IUpload>) ||
  mongoose.model<IUpload>("Upload", UploadSchema);

export default Upload;
