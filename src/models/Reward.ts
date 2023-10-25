import mongoose, { Schema, Document } from "mongoose";

export interface IReward extends Document {
  userId: mongoose.Types.ObjectId;
  reason: {
    refType: string;
    refId: mongoose.Types.ObjectId;
    userActivityId?: mongoose.Types.ObjectId;
    placeId?: mongoose.Types.ObjectId;
  };
  amount: number;
  createdAt: Date;
}

const RewardSchema: Schema = new Schema<IReward>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  reason: {
    refType: { type: String, required: true }, //TODO: REVIEW, COMMENT, REACTION, PLACE
    refId: {
      type: Schema.Types.ObjectId,
      refPath: "reason.refType",
      required: false,
    },
    userActivityId: {
      type: Schema.Types.ObjectId,
      ref: "UserActivity",
      required: false,
    },
    placeId: {
      type: Schema.Types.ObjectId,
      ref: "Place",
      required: false,
    },
  },
  amount: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Reward ||
  mongoose.model<IReward>("Reward", RewardSchema);
