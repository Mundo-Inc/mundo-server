import mongoose, { Schema, type Document } from "mongoose";

export interface IReaction extends Document {
  user: mongoose.Types.ObjectId;
  target: mongoose.Types.ObjectId;
  type: "emoji" | "special";
  reaction: string;
  createdAt: Date;
  source?: "yelp" | "google";
}

const ReactionSchema = new Schema<IReaction>({
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  target: {
    type: Schema.Types.ObjectId,
    required: true,
    index: true,
    refPath: "UserActivity",
  },
  type: {
    type: String,
    required: true,
    enum: ["emoji", "special"],
  },
  reaction: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  source: {
    type: String,
    enum: ["yelp", "google"],
  },
});

export default mongoose.models.Reaction ||
  mongoose.model<IReaction>("Reaction", ReactionSchema);
