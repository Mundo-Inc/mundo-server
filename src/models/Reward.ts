import mongoose, { Schema, Document } from "mongoose";

export interface IReward extends Document {
  userId: mongoose.Types.ObjectId;
  reason: {
    refType: string;
    refId: mongoose.Types.ObjectId;
    userActivityId?: mongoose.Types.ObjectId;
  };
  amount: number;
  date: Date;
}

const RewardSchema: Schema = new Schema<IReward>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  reason: {
    refType: { type: String, required: true },
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
  },
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now },
});

export default mongoose.models.Reward ||
  mongoose.model<IReward>("Reward", RewardSchema);
