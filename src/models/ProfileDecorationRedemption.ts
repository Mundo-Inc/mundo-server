import mongoose, { Schema, type Document } from "mongoose";

export interface IProfileDecorationRedemption extends Document {
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

export default mongoose.models.ProfileDecorationRedemption ||
  mongoose.model<IProfileDecorationRedemption>(
    "ProfileDecorationRedemption",
    ProfileDecorationRedemption
  );
