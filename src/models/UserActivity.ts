import mongoose, { Schema, type Document } from "mongoose";

export enum ActivityTypeEnum {
  NEW_CHECKIN = "NEW_CHECKIN",
  NEW_REVIEW = "NEW_REVIEW",
  NEW_RECOMMEND = "NEW_RECOMMEND",
  REACT_TO_REVIEW = "REACT_TO_REVIEW",
  REACT_TO_PLACE = "REACT_TO_PLACE",
  ADD_PLACE = "ADD_PLACE",
  GOT_BADGE = "GOT_BADGE",
  LEVEL_UP = "LEVEL_UP",
  CREATE_DEAL = "CREATE_DEAL",
  FOLLOWING = "FOLLOWING",
}

export enum ActivityPrivacyTypeEnum {
  PUBLIC = "PUBLIC",
  PRIVATE = "PRIVATE",
  FOLLOWING = "FOLLOWING",
}

export enum ResourceTypeEnum {
  PLACE = "Place",
  REVIEW = "Review",
  DEAL = "Deal",
  CHECKIN = "Checkin",
  USER = "User",
  REACTION = "Reaction",
  ACHIEVEMET = "Achievement",
}

export interface IUserActivity extends Document {
  userId: mongoose.Types.ObjectId;
  activityType: ActivityTypeEnum;
  resourceType: ResourceTypeEnum;
  resourceId: mongoose.Types.ObjectId;
  placeId?: mongoose.Types.ObjectId;
  privacyType: ActivityPrivacyTypeEnum;
  createdAt: Date;
}

const UserActivitySchema: Schema = new Schema<IUserActivity>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    activityType: {
      type: String,
      required: true,
      enum: Object.values(ActivityTypeEnum),
    },
    resourceType: {
      type: String,
      enum: Object.values(ResourceTypeEnum),
      required: true,
    },
    resourceId: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: "resourceType",
    },
    placeId: {
      type: Schema.Types.ObjectId,
      refPath: "Place",
      default: null,
    },
    privacyType: {
      type: String,
      enum: Object.values(ActivityPrivacyTypeEnum),
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

UserActivitySchema.index({
  userId: 1,
  activityType: 1,
  resourceType: 1,
  resourceId: 1,
});

export default mongoose.models.UserActivity ||
  mongoose.model<IUserActivity>("UserActivity", UserActivitySchema);
