import mongoose, { Schema, type Model } from "mongoose";

export interface IReward {
  _id: mongoose.Types.ObjectId;
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

const RewardSchema = new Schema<IReward>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  reason: {
    refType: { type: String, required: true }, //TODO: REVIEW, COMMENT, REACTION, PLACE, Homemade
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

const Reward =
  (mongoose.models.Reward as Model<IReward>) ||
  mongoose.model<IReward>("Reward", RewardSchema);

export default Reward;
