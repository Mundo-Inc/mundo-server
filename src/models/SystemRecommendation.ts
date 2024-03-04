import mongoose, { Schema, type Document } from "mongoose";

interface ISystemRecommendation extends Document {
  placeId: mongoose.Types.ObjectId;
  score: number;
}

const SystemRecommendationSchema: Schema = new Schema({
  placeId: { type: mongoose.Types.ObjectId, ref: "Place", required: true },
  score: { type: Number, required: true },
});

export default mongoose.models.SystemRecommendation ||
  mongoose.model<ISystemRecommendation>(
    "SystemRecommendation",
    SystemRecommendationSchema
  );
