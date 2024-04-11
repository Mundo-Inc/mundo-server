import mongoose, { Schema, type Document } from "mongoose";

import { weights } from "../config/trendFactors";
import ScoreWeight, { type IScoreWeight } from "./ScoreWeight";

export enum ActivityTypeEnum {
  NEW_CHECKIN = "NEW_CHECKIN",
  NEW_REVIEW = "NEW_REVIEW",
  NEW_HOMEMADE = "NEW_HOMEMADE",
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

export enum ActivityResourceTypeEnum {
  PLACE = "Place",
  REVIEW = "Review",
  DEAL = "Deal",
  CHECKIN = "Checkin",
  USER = "User",
  REACTION = "Reaction",
  ACHIEVEMET = "Achievement",
  HOMEMADE = "Homemade",
}

export interface IUserActivity extends Document {
  userId: mongoose.Types.ObjectId;
  activityType: ActivityTypeEnum;
  resourceType: ActivityResourceTypeEnum;
  resourceId: mongoose.Types.ObjectId;
  placeId?: mongoose.Types.ObjectId;
  geoLocation?: {
    type: string;
    coordinates: number[];
  }; // { type: "Point", coordinates: [ longitude, latitude ] }
  privacyType: ActivityPrivacyTypeEnum;
  newLevel?: number;
  hasMedia: boolean;
  hotnessScore: number;
  createdAt: Date;
  engagements: {
    reactions: number;
    comments: number;
    views: number;
  };
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
      enum: Object.values(ActivityResourceTypeEnum),
      required: true,
    },
    resourceId: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: "resourceType",
    },
    placeId: {
      type: Schema.Types.ObjectId,
      ref: "Place",
      default: null,
    },
    geoLocation: {
      type: { type: String },
      coordinates: { type: [Number], required: false },
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
      },
    },
  },
  { timestamps: true }
);

UserActivitySchema.index({
  userId: 1,
  activityType: 1,
  resourceType: 1,
  resourceId: 1,
  hotnessScore: -1,
});

function getFreshHoursBoost(hoursValue: number) {
  const boostThresholds = [
    { limit: 1, boost: weights.latest1HoursBoost },
    { limit: 3, boost: weights.latest3HoursBoost },
    { limit: 6, boost: weights.latest6HoursBoost },
    { limit: 12, boost: weights.latest12HoursBoost },
    { limit: 24, boost: weights.latest24HoursBoost },
    { limit: 48, boost: weights.latest48HoursBoost },
  ];

  for (let threshold of boostThresholds) {
    if (hoursValue <= threshold.limit) {
      return threshold.boost;
    }
  }
  return 0;
}

UserActivitySchema.methods.calculateHotnessScore = async function () {
  const hoursSinceCreation = Math.max(
    1,
    (new Date().getTime() - this.createdAt.getTime()) / 36e5
  );

  const hoursValue = Math.max(1, hoursSinceCreation);
  const timeDecayFactor = Math.pow(1 / hoursValue, weights.timeDecay);
  let score =
    (this.engagements.reactions * weights.reaction +
      this.engagements.comments * weights.comment +
      this.engagements.views * weights.view) *
    timeDecayFactor;
  const newPostBoost = weights.newPostInitialBoost / hoursValue;
  let finalScore = score + newPostBoost + getFreshHoursBoost(hoursValue);

  const scoreWeightEntry = (await ScoreWeight.findOne({
    userId: this.userId,
  }).lean()) as IScoreWeight;
  if (scoreWeightEntry) {
    finalScore *= scoreWeightEntry.value;
  }
  return finalScore;
};

UserActivitySchema.methods.updateHotnessScore = async function () {
  const hotnessScore = await this.calculateHotnessScore();
  this.hotnessScore = hotnessScore;
  return this.save();
};

UserActivitySchema.pre<IUserActivity>("save", async function (next) {
  // Check if placeId is set for this UserActivity
  if (this.placeId && (!this.geoLocation || !this.geoLocation.coordinates)) {
    try {
      // Assuming you have a Place model available
      const place = await mongoose.model("Place").findById(this.placeId).exec();
      if (place && place.location && place.location.geoLocation) {
        // Copy geoLocation from Place to UserActivity
        this.geoLocation = {
          type: place.location.geoLocation.type,
          coordinates: place.location.geoLocation.coordinates,
        };
      }
    } catch (error: any) {
      console.error("Error fetching Place for geoLocation copy:", error);
      return next(error);
    }
  }
  next();
});

UserActivitySchema.index({ geoLocation: "2dsphere" });

export default mongoose.models.UserActivity ||
  mongoose.model<IUserActivity>("UserActivity", UserActivitySchema);
