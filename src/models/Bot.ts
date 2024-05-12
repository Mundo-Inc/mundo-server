import mongoose, { Schema, type Model } from "mongoose";

export enum IBotTypeEnum {
  REACT = "REACT",
  COMMENT = "COMMENT",
  REVIEW = "REVIEW",
}

export enum IBotTargetEnum {
  REVIEWS = "REVIEWS",
  CHECKINS = "CHECKINS",
  HAS_MEDIA = "HAS_MEDIA",
}

export interface IBot {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type: IBotTypeEnum;
  target: String;
  targetThresholdHours: number;
  reactions: String[];
  comments: String[];
  interval: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BotSchema = new Schema<IBot>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: Object.values(IBotTypeEnum),
      default: IBotTypeEnum.REACT,
    },
    target: {
      type: String,
      enum: Object.values(IBotTargetEnum),
      required: true,
    },
    targetThresholdHours: { type: Number, default: 24 },
    reactions: {
      type: [String],
      default: ["❤️"],
    },
    comments: { type: [String], default: [] },
    interval: { type: String, default: "0 0 * * *" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const model =
  (mongoose.models.Bot as Model<IBot>) ||
  mongoose.model<IBot>("Bot", BotSchema);

export default model;
