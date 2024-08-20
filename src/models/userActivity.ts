import mongoose, { Schema, type Model } from "mongoose";

import logger from "../api/services/logger/index.js";
import { weights } from "../config/trendFactors.js";
import { ResourceTypeEnum } from "./enum/resourceTypeEnum.js";
import ScoreWeight from "./scoreWeight.js";

export enum ActivityTypeEnum {
  NewCheckIn = "NEW_CHECKIN",
  NewReview = "NEW_REVIEW",
  NewHomemade = "NEW_HOMEMADE",
  NewRecommend = "NEW_RECOMMEND",
  AddPlace = "ADD_PLACE",
  LevelUp = "LEVEL_UP",
  Following = "FOLLOWING",
}

export enum ResourcePrivacyEnum {
  Public = "PUBLIC",
  Private = "PRIVATE",
  Followers = "FOLLOWERS",
}

export type UserActivityResourceType =
  | ResourceTypeEnum.Place
  | ResourceTypeEnum.Review
  | ResourceTypeEnum.CheckIn
  | ResourceTypeEnum.User
  | ResourceTypeEnum.Reaction
  | ResourceTypeEnum.Achievement
  | ResourceTypeEnum.Homemade;

const UserActivityResourceTypes: UserActivityResourceType[] = [
  ResourceTypeEnum.Place,
  ResourceTypeEnum.Review,
  ResourceTypeEnum.CheckIn,
  ResourceTypeEnum.User,
  ResourceTypeEnum.Reaction,
  ResourceTypeEnum.Achievement,
  ResourceTypeEnum.Homemade,
];

export interface IUserActivity {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  activityType: ActivityTypeEnum;
  resourceId: mongoose.Types.ObjectId;
  resourceType: UserActivityResourceType;
  resourcePrivacy: ResourcePrivacyEnum;
  isAccountPrivate: boolean;
  placeId?: mongoose.Types.ObjectId;
  geoLocation?: {
    type: string;
    coordinates: number[];
  }; // { type: "Point", coordinates: [ longitude, latitude ] }
  newLevel?: number;
  hasMedia: boolean;
  hotnessScore: number;
  engagements: {
    reactions: number;
    comments: number;
    views: number;
  };
  uniqueReactions: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

interface IUserActivityMethods {
  calculateHotnessScore(): Promise<number>;
  updateHotnessScore(): Promise<IUserActivity>;
}

type UserActivityModel = Model<IUserActivity, {}, IUserActivityMethods>;

const UserActivitySchema = new Schema<
  IUserActivity,
  UserActivityModel,
  IUserActivityMethods
>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    activityType: {
      type: String,
      required: true,
      enum: Object.values(ActivityTypeEnum),
    },
    resourceType: {
      type: String,
      enum: UserActivityResourceTypes,
      required: true,
    },
    resourceId: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: "resourceType",
    },
    resourcePrivacy: {
      type: String,
      enum: Object.values(ResourcePrivacyEnum),
      required: true,
    },
    isAccountPrivate: {
      type: Boolean,
      default: false,
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
    newLevel: {
      type: Number,
      required: false,
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
    uniqueReactions: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
  },
  { timestamps: true },
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
    (new Date().getTime() - this.createdAt.getTime()) / 36e5,
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

  const scoreWeightEntry = await ScoreWeight.findOne({
    userId: this.userId,
  }).lean();
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

UserActivitySchema.pre("save", async function (next) {
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
      logger.error("Error fetching Place for geoLocation copy:", error);
      return next(error);
    }
  }
  next();
});

UserActivitySchema.index({ geoLocation: "2dsphere" });

const UserActivity =
  (mongoose.models.UserActivity as UserActivityModel) ||
  mongoose.model<IUserActivity, UserActivityModel>(
    "UserActivity",
    UserActivitySchema,
  );

export default UserActivity;
