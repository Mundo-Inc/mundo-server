import mongoose, { Schema, type Document } from "mongoose";

export type UploadUsecase = "profileImage" | "placeReview";

export interface IUpload extends Document {
  user: mongoose.Types.ObjectId;
  key: string;
  src: string;
  type: string;
  usecase: UploadUsecase;
  createdAt: Date;
}

const UploadSchema: Schema = new Schema<IUpload>({
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

export default mongoose.models.Upload ||
  mongoose.model<IUpload>("Upload", UploadSchema);
