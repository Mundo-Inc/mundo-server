import mongoose, { Schema, type Document } from "mongoose";

interface ILinkedAccount extends Document {
  user: mongoose.Types.ObjectId;
  provider: "google" | "facebook" | "twitter" | "apple";
  providerId: string;
  accessToken: string;
  refreshToken: string;
}

const LinkedAccountSchema = new Schema<ILinkedAccount>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    provider: {
      type: String,
      required: true,
      enum: ["google", "facebook", "twitter", "apple"],
    },
    providerId: {
      type: String,
      required: true,
    },
    accessToken: {
      type: String,
      required: true,
    },
    refreshToken: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.models.LinkedAccount ||
  mongoose.model<ILinkedAccount>("LinkedAccount", LinkedAccountSchema);
