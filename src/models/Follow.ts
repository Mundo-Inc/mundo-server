import mongoose, { Schema, type Document } from "mongoose";

export interface IFollow extends Document {
  user: mongoose.Types.ObjectId;
  target: mongoose.Types.ObjectId;
  createdAt: Date;
}

const FollowSchema = new Schema<IFollow>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    target: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

FollowSchema.index({ user: 1, target: 1 });

export default mongoose.models.Follow ||
  mongoose.model<IFollow>("Follow", FollowSchema);
