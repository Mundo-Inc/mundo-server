import mongoose, { Schema, type Document } from "mongoose";

export interface IBlacklist extends Document {
  userId: mongoose.Types.ObjectId;
  value: number;
}

const BlacklistSchema = new Schema<IBlacklist>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  value: {
    type: Number,
    required: true,
  },
});

export default mongoose.models.Blacklist ||
  mongoose.model<IBlacklist>("Blacklist", BlacklistSchema);
