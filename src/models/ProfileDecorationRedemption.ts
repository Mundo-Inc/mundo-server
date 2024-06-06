import mongoose, { Schema, type Model } from "mongoose";

export enum ProfileDecorationEnum {
  ProfileFrame = "PROFILE_FRAME",
  ProfileCover = "PROFILE_COVER",
}
export interface IProfileDecorationRedemption {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  decorationType: ProfileDecorationEnum;
  decorationId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ProfileDecorationRedemptionSchema =
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

const ProfileDecorationRedemption =
  (mongoose.models
    .ProfileDecorationRedemption as Model<IProfileDecorationRedemption>) ||
  mongoose.model<IProfileDecorationRedemption>(
    "ProfileDecorationRedemption",
    ProfileDecorationRedemptionSchema
  );

export default ProfileDecorationRedemption;
