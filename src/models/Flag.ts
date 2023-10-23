import mongoose, { Schema, type Document } from "mongoose";

// Flag reasons
export enum FlagTypeEnum {
  INAPPROPRIATE_CONTENT = "Inappropriate Content",
  SPAM = "Spam",
  FALSE_INFORMATION = "False Information",
  PERSONAL_INFORMATION = "Personal Information",
  OFF_TOPIC = "Off-topic",
  HARASSMENT = "Harassment",
  SUSPECTED_FAKE_REVIEW = "Suspected Fake Review",
  COPYRIGHT_VIOLATION = "Copyright Violation",
  OTHER = "Other",
}

export interface IFlag extends Document {
  user: mongoose.Types.ObjectId;
  target: mongoose.Types.ObjectId;
  flagType: FlagTypeEnum;
  note: string;
  createdAt: Date;
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
      ref: "Review",
      required: true,
      index: true,
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
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

FlagSchema.index({ user: 1, target: 1 });

export default mongoose.models.Flag ||
  mongoose.model<IFlag>("Flag", FlagSchema);
