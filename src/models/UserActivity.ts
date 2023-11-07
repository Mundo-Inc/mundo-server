import mongoose, { Schema, type Document } from "mongoose";
import { weights } from "../config/trendFactors";

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
  newLevel?: number;
  hasMedia: boolean;
  hotnessScore: number;
  createdAt: Date;
  engagements: {
    reactions: number;
    comments: number;
    views: number;
  }
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
    newLevel: {
      type: Number,
      required: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    hotnessScore: {
      type: Number,
      default: 0, // Initialized to a default value
    },
    hasMedia: {
      type: Boolean,
      default: false,
    },
    engagements: {
      reactions: {
        type: Number,
        default: 0,
      },
      comments: {
        type: Number,
        default: 0,
      },
      views: {
        type: Number,
        default: 0,
      }
    }
  },
  { timestamps: true }
);

UserActivitySchema.index({
  userId: 1,
  activityType: 1,
  resourceType: 1,
  resourceId: 1,
});

UserActivitySchema.methods.calculateHotnessScore = function () {
  const hoursSinceCreation = Math.max(1, (new Date().getTime() - this.createdAt.getTime()) / 36e5);
  const reactionWeight = weights.reaction;
  const commentWeight = weights.comment;
  const viewWeight = weights.view;
  const timeDecayFactor = Math.pow(1 / hoursSinceCreation, weights.timeDecay);

  const hotnessScore = (this.engagements.reactions * reactionWeight +
    this.engagements.comments * commentWeight +
    this.engagements.views * viewWeight) * timeDecayFactor;

  return hotnessScore;
};

UserActivitySchema.methods.updateHotnessScore = function () {
  const hotnessScore = this.calculateHotnessScore();
  this.hotnessScore = hotnessScore;
  return this.save();
};

export default mongoose.models.UserActivity ||
  mongoose.model<IUserActivity>("UserActivity", UserActivitySchema);
