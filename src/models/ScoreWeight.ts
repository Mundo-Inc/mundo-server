import mongoose, { Schema, type Document } from "mongoose";

export interface IScoreWeight extends Document {
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

export default mongoose.models.ScoreWeight ||
  mongoose.model<IScoreWeight>("ScoreWeight", ScoreWeightSchema);
