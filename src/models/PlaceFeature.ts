import mongoose, { Schema, type Document } from "mongoose";

import { MATCHING_FEATURES } from "../data/matching/categories";

type IFeatureCategory = Record<string, number>;

export type IFeatureVector = {
  [K in keyof typeof MATCHING_FEATURES]: IFeatureCategory;
};

export interface IPlaceFeature extends Document {
  place: mongoose.Types.ObjectId;
  featureVector: IFeatureVector;
  processedReviews: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const featureVectorSchema = Object.fromEntries(
  Object.keys(MATCHING_FEATURES).map((category) => [
    category,
    { type: Map, of: Number },
  ])
);

const PlaceFeatureSchema: Schema = new Schema<IPlaceFeature>(
  {
    place: { type: Schema.Types.ObjectId, ref: "Place", required: true },
    featureVector: {
      type: Object,
      required: true,
      of: featureVectorSchema,
    },
    processedReviews: [
      { type: Schema.Types.ObjectId, ref: "Review", required: true },
    ],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.PlaceFeature ||
  mongoose.model<IPlaceFeature>("PlaceFeature", PlaceFeatureSchema);
