import mongoose, { Schema, type Document } from "mongoose";

export interface IComment extends Document {
  author: mongoose.Types.ObjectId;
  userActivity: mongoose.Types.ObjectId;
  content: string;
  status?: "active" | "deleted";
}

const CommentSchema = new Schema<IComment>(
  {
    author: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Author is required"],
      index: true,
    },
    userActivity: {
      type: Schema.Types.ObjectId,
      ref: "UserActivity",
      required: [true, "UserActivity is required"],
    },
    content: {
      type: String,
      required: [true, "Content is required"],
      minlength: [1, "Content must be at least 1 character"],
      maxlength: [250, "Content must be at most 250 characters"],
    },
    status: {
      type: String,
      enum: ["active", "deleted"],
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.Comment ||
  mongoose.model<IComment>("Comment", CommentSchema);
