import mongoose, { Schema, type Model } from "mongoose";

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

export interface IMission {
  _id: mongoose.Types.ObjectId;
  title: string;
  subtitle?: string;
  icon: string;
  task: ITask;
  rewardAmount: number;
  startsAt: Date;
  expiresAt: Date;
  createdAt: Date;
}

const MissionSchema = new Schema<IMission>({
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

const Mission =
  (mongoose.models.Mission as Model<IMission>) ||
  mongoose.model<IMission>("Mission", MissionSchema);

export default Mission;
