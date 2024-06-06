import mongoose, { Schema, type Model } from "mongoose";

enum ScheduledTaskStatus {
  Pending = "PENDING",
  Running = "RUNNING",
  Failed = "FAILED",
}

enum ScheduledTaskType {
  ReactToActivity = "REACT_TO_ACTIVITY",
  CommentOnActivity = "COMMENT_ON_ACTIVITY",
  ReplyToComment = "REPLY_TO_COMMENT",
}

export interface IScheduledTask {
  _id: mongoose.Types.ObjectId;
  status: ScheduledTaskStatus;
  type: ScheduledTaskType;
  resource: mongoose.Types.ObjectId;
  scheduledAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

const ScheduledTaskSchema = new Schema<IScheduledTask>(
  {},
  { timestamps: true }
);

const ScheduledTask =
  (mongoose.models.ScheduledTask as Model<IScheduledTask>) ||
  mongoose.model<IScheduledTask>("ScheduledTask", ScheduledTaskSchema);

export default ScheduledTask;
