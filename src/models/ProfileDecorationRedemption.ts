import mongoose, { Schema, type Model } from "mongoose";

export interface IProfileDecorationRedemption {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  decorationType: string;
  decorationId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export enum ProfileDecorationEnum {
  PROFILE_FRAME = "ProfileFrame",
  PROFILE_COVER = "ProfileCover",
}

const ProfileDecorationRedemption: Schema =
  new Schema<IProfileDecorationRedemption>(
    {
      userId: { type: Schema.Types.ObjectId, ref: "User" },
      decorationId: { type: Schema.Types.ObjectId },
      decorationType: {
        type: String,
        enum: Object.values(ProfileDecorationEnum),
      },
    },
    { timestamps: true }
  );

const model =
  (mongoose.models
    .ProfileDecorationRedemption as Model<IProfileDecorationRedemption>) ||
  mongoose.model<IProfileDecorationRedemption>(
    "ProfileDecorationRedemption",
    ProfileDecorationRedemption
  );

export default model;
