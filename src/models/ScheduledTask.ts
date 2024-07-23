import mongoose, { Schema, type Model, type Types } from "mongoose";

export enum ScheduledTaskStatus {
  Pending = "PENDING",
  Running = "RUNNING",
  Failed = "FAILED",
}

export enum ScheduledTaskType {
  CommentOnActivity = "COMMENT_ON_ACTIVITY",
  ReplyToComment = "REPLY_TO_COMMENT",
}

export interface IScheduledTask {
  _id: Types.ObjectId;

  status: ScheduledTaskStatus;
  type: ScheduledTaskType;
  resourceId: Types.ObjectId;
  scheduledAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

const ScheduledTaskSchema = new Schema<IScheduledTask>(
  {
    status: {
      type: String,
      enum: Object.values(ScheduledTaskStatus),
      default: ScheduledTaskStatus.Pending,
    },
    type: {
      type: String,
      enum: Object.values(ScheduledTaskType),
      required: true,
    },
    resourceId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    scheduledAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

ScheduledTaskSchema.index({ status: 1, scheduledAt: 1 });

const ScheduledTask =
  (mongoose.models.ScheduledTask as Model<IScheduledTask>) ||
  mongoose.model<IScheduledTask>("ScheduledTask", ScheduledTaskSchema);

export default ScheduledTask;
