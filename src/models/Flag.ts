import mongoose, { Schema, type Model } from "mongoose"; // Corrected the import statement

// Flag reasons
export enum FlagTypeEnum {
  INAPPROPRIATE_CONTENT = "INAPPROPRIATE_CONTENT",
  SPAM = "SPAM",
  FALSE_INFORMATION = "FALSE_INFORMATION",
  PERSONAL_INFORMATION = "PERSONAL_INFORMATION",
  OFF_TOPIC = "OFF_TOPIC",
  HARASSMENT = "HARASSMENT",
  SUSPECTED_FAKE_REVIEW = "SUSPECTED_FAKE_REVIEW",
  COPYRIGHT_VIOLATION = "COPYRIGHT_VIOLATION",
  OTHER = "OTHER",
}

export enum TargetTypeEnum {
  REVIEW = "Review",
  COMMENT = "Comment",
  CHECKIN = "CheckIn",
  HOMEMADE = "Homemade",
}

export enum AdminActionEnum {
  IGNORE = "IGNORE",
  DELETE = "DELETE",
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
  targetType: TargetTypeEnum;
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
      enum: Object.values(TargetTypeEnum),
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
