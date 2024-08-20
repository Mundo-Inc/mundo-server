import mongoose, { Schema, type Model } from "mongoose";

export interface IScoreWeight {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  value: number;
}

const ScoreWeightSchema = new Schema<IScoreWeight>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  value: {
    type: Number,
    required: true,
  },
});

const ScoreWeight =
  (mongoose.models.ScoreWeight as Model<IScoreWeight>) ||
  mongoose.model<IScoreWeight>("ScoreWeight", ScoreWeightSchema);

export default ScoreWeight;
