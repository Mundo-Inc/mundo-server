import mongoose, { Schema, type Document } from "mongoose";
import { IFeatureVector } from "./PlaceFeature";
import { MATCHING_FEATURES } from "../data/matching/categories";

export interface IUserFeature extends Document {
  user: mongoose.Types.ObjectId;
  featureVector: IFeatureVector;
  interactedReviews: mongoose.Types.ObjectId[];
  interactedPlaces: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const featureVectorSchema = Object.fromEntries(
  Object.keys(MATCHING_FEATURES).map((category) => [
    category,
    { type: Map, of: Number },
  ])
);

const UserFeatureSchema: Schema = new Schema<IUserFeature>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    featureVector: {
      type: Object,
      required: true,
      of: featureVectorSchema,
    },
    interactedReviews: [
      { type: Schema.Types.ObjectId, ref: "Review", required: false },
    ],
    interactedPlaces: [
      { type: Schema.Types.ObjectId, ref: "Place", required: false },
    ],
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.UserFeature ||
  mongoose.model<IUserFeature>("UserFeature", UserFeatureSchema);
