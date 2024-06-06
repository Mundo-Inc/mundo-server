import mongoose, { Schema, type Model } from "mongoose"; // Corrected the import statement
import { ResourceTypeEnum } from "./Enum/ResourceTypeEnum.js";

// Flag reasons
export enum FlagTypeEnum {
  InappropriateContent = "INAPPROPRIATE_CONTENT",
  Spam = "SPAM",
  FalseInformation = "FALSE_INFORMATION",
  PersonalInformation = "PERSONAL_INFORMATION",
  OffTopic = "OFF_TOPIC",
  Harassment = "HARASSMENT",
  SuspectedFakeReview = "SUSPECTED_FAKE_REVIEW",
  CopyrightViolation = "COPYRIGHT_VIOLATION",
  Other = "OTHER",
}

export type FlagTargetType =
  | ResourceTypeEnum.Review
  | ResourceTypeEnum.Comment
  | ResourceTypeEnum.CheckIn
  | ResourceTypeEnum.Homemade;

const FlagTargetTypes: FlagTargetType[] = [
  ResourceTypeEnum.Review,
  ResourceTypeEnum.Comment,
  ResourceTypeEnum.CheckIn,
  ResourceTypeEnum.Homemade,
];

export enum AdminActionEnum {
  Ignore = "IGNORE",
  Delete = "DELETE",
}

interface AdminAction {
  type: string;
  note: string;
  admin: mongoose.Types.ObjectId;
  createdAt: Date;
}

export interface IFlag {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  target: mongoose.Types.ObjectId;
  targetType: FlagTargetType;
  flagType: FlagTypeEnum;
  note: string;
  adminAction: AdminAction;
  createdAt: Date;
  updatedAt: Date;
}

const FlagSchema = new Schema<IFlag>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    target: {
      type: Schema.Types.ObjectId,
      refPath: "targetType",
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      enum: FlagTargetTypes,
      required: true,
    },
    flagType: {
      type: String,
      enum: Object.keys(FlagTypeEnum),
      required: true,
    },
    note: {
      type: String,
      required: false,
    },
    adminAction: {
      type: new Schema<AdminAction>({
        type: {
          type: String,
          enum: ["DELETE", "IGNORE"],
          required: true,
        },
        note: {
          type: String,
          required: false,
        },
        admin: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      }),
      required: false,
    },
  },
  { timestamps: true }
);

FlagSchema.index({ user: 1, target: 1 });

const Flag =
  (mongoose.models.Flag as Model<IFlag>) ||
  mongoose.model<IFlag>("Flag", FlagSchema);

export default Flag;
