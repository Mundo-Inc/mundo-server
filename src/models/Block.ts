import mongoose, { Schema, type Model } from "mongoose";

export interface IBlock {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  target: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
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
  },
  { timestamps: true }
);

BlockSchema.index({ user: 1, target: 1 });

const Block =
  (mongoose.models.Block as Model<IBlock>) ||
  mongoose.model<IBlock>("Block", BlockSchema);

export default Block;
