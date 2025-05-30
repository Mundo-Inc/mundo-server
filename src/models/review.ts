import mongoose, { Schema, type CallbackError, type Model } from "mongoose";

import DeletionService from "../api/services/deletionService.js";
import logger from "../api/services/logger/index.js";
import Comment from "./comment.js";
import Media from "./media.js";
import Place from "./place.js";
import Reaction from "./reaction.js";
import UserActivity, { ResourcePrivacyEnum } from "./userActivity.js";

export interface IReview {
  _id: mongoose.Types.ObjectId;
  writer: mongoose.Types.ObjectId;
  place: mongoose.Types.ObjectId;
  scores: {
    overall?: number;
    drinkQuality?: number;
    foodQuality?: number;
    atmosphere?: number;
    service?: number;
    value?: number;
  };
  originalContent?: string;
  content: string;
  media?: mongoose.Types.ObjectId[];
  tags?: string[];
  recommend?: boolean;
  language: string;
  createdAt: Date;
  updatedAt: Date;
  userActivityId?: mongoose.Types.ObjectId;
  source?: "yelp" | "google";
  lastProcessDate?: Date;
  processError?: "rateLimit" | "notValidResponse" | "parseError";
  privacyType: ResourcePrivacyEnum;
}

const ReviewSchema = new Schema<IReview>(
  {
    writer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    place: { type: Schema.Types.ObjectId, ref: "Place", required: true },
    scores: {
      type: {
        overall: Number,
        drinkQuality: Number,
        foodQuality: Number,
        atmosphere: Number,
        service: Number,
        value: Number,
      },
      default: {},
    },
    originalContent: { type: String },
    content: { type: String, default: "" },
    media: [{ type: Schema.Types.ObjectId, ref: "Media" }],
    tags: [{ type: String }],
    recommend: { type: Boolean, default: false },
    language: { type: String, default: "en" },
    userActivityId: { type: Schema.Types.ObjectId, ref: "UserActivity" },
    source: {
      type: String,
      enum: ["yelp", "google"],
    },
    lastProcessDate: { type: Date },
    processError: {
      type: String,
      enum: ["rateLimit", "notValidResponse", "parseError"],
    },
    privacyType: {
      type: String,
      enum: Object.values(ResourcePrivacyEnum),
      default: ResourcePrivacyEnum.Public,
      required: true,
    },
  },
  { timestamps: true },
);

ReviewSchema.index({ place: 1 });

// dependency removal function
async function removeReviewDependencies(review: IReview) {
  // remove all reactions related to the review
  const reactions = await Reaction.find({ target: review.userActivityId });
  await Promise.all(reactions.map((reaction) => reaction.deleteOne()));

  // remove all comments related to the review
  const comments = await Comment.find({
    userActivity: review.userActivityId,
  });
  await Promise.all(
    comments.map((comment) => DeletionService.deleteComment(comment._id)),
  );

  // remove the userActivity related to the review
  const userActivity = await UserActivity.findById(review.userActivityId);
  if (userActivity) {
    await userActivity.deleteOne();
  }

  // remove all media related to the review
  if (review.media && review.media.length > 0) {
    for (const m of review.media) {
      await Media.deleteOne({ _id: m });
    }
  }
}

// Middleware for review.deleteOne (document)
ReviewSchema.pre(
  "deleteOne",
  { document: true, query: false },
  async function (next) {
    try {
      await removeReviewDependencies(this);

      await Place.updateOne(
        { _id: this.place },
        { $inc: { "activities.reviewCount": -1 } },
      );

      next();
    } catch (error) {
      logger.error(`Error in deleteOne middleware for document: ${error}`);
      next(error as CallbackError);
    }
  },
);

// Middleware for Review.deleteOne (query)
ReviewSchema.pre(
  "deleteOne",
  { query: true, document: false },
  async function (next) {
    try {
      const review = await this.model.findOne(this.getQuery());

      if (!review) {
        logger.warn("Review not found in deleteOne query middleware.");
        return next();
      }

      await removeReviewDependencies(review);

      await Place.updateOne(
        { _id: review.place },
        { $inc: { "activities.reviewCount": -1 } },
      );

      next();
    } catch (error) {
      logger.error(`Error in deleteOne middleware for query: ${error}`);
      next(error as CallbackError);
    }
  },
);

const Review =
  (mongoose.models.Review as Model<IReview>) ||
  mongoose.model<IReview>("Review", ReviewSchema);

export default Review;
