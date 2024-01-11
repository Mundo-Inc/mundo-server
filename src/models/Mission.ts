import mongoose, { Schema, Document } from "mongoose";

export enum TaskTypeEnum {
  REVIEW = "REVIEW",
  HAS_MEDIA = "HAS_MEDIA",
  CHECKIN = "CHECKIN",
  REACT = "REACT",
}

export interface ITask {
  type: TaskTypeEnum;
  count: number;
}

export interface IMission extends Document {
  title: string;
  subtitle?: string;
  icon: string;
  task: ITask;
  rewardAmount: number;
  startsAt: Date;
  expiresAt: Date;
  createdAt: Date;
}

const MissionSchema: Schema = new Schema<IMission>({
  title: { type: String, required: true },
  subtitle: { type: String, required: false },
  icon: { type: String, required: true },
  task: {
    type: { type: String, enum: Object.values(TaskTypeEnum), required: true },
    count: { type: Number, required: true },
  },
  rewardAmount: { type: Number, required: true },
  startsAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Mission ||
  mongoose.model<IMission>("Mission", MissionSchema);
