import mongoose, { Schema, type Document } from "mongoose";

export interface IBlock extends Document {
  user: mongoose.Types.ObjectId;
  target: mongoose.Types.ObjectId;
  createdAt: Date;
}

const BlockSchema = new Schema<IBlock>(
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

BlockSchema.index({ user: 1, target: 1 });

export default mongoose.models.Block ||
  mongoose.model<IBlock>("Block", BlockSchema);
