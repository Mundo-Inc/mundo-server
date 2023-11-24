import mongoose, { Schema, type Document, CallbackError } from "mongoose";
import Place from "./Place";
import Reaction from "./Reaction";
import Comment from "./Comment";
import UserActivity from "./UserActivity";

export const predefinedTags = [
  "gourmet_cuisine",
  "local_ingredients",
  "organic_food",
  "extensive_wine_list",
  "craft_beers",
  "innovative_cocktails",
  "delicious_desserts",
  "fresh_seafood",
  "authentic_cuisine",
  "romantic_setting",
  "family_friendly",
  "business_meetings",
  "outdoor_seating",
  "live_music",
  "waterfront_view",
  "rooftop",
  "cozy_atmosphere",
  "highend_luxury",
  "trendy_spot",
  "rustic_charm",
  "excellent_service",
  "friendly_staff",
  "knowledgeable_sommelier",
  "quick_service",
  "personalized_service",
  "late_night",
  "brunch_spot",
  "happy_hour",
  "pet_friendly",
  "wheelchair_accessible",
  "vegan_options",
  "gluten_free_options",
  "private_dining",
  "chefs_table",
  "tasting_menu",
  "budget_friendly",
  "midrange_pricing",
  "fine_dining",
  "city_center",
  "off_the_beaten_path",
  "scenic_location",
  "neighborhood_gem",
  "italian",
  "french",
  "asian",
  "mexican",
  "mediterranean",
  "seafood",
  "steakhouse",
  "fusion",
  "bbq",
  "vegan",
  "slow_service",
  "limited_menu",
  "overpriced",
  "crowded",
  "noisy_environment",
  "limited_vegan_options",
  "limited_drink_selection",
  "poor_accessibility",
];

export interface IReview extends Document {
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
  images?: mongoose.Types.ObjectId[];
  videos?: mongoose.Types.ObjectId[];
  tags?: string[];
  recommend?: boolean;
  language: string;
  createdAt: Date;
  updatedAt: Date;
  userActivityId?: mongoose.Types.ObjectId;
  source?: "yelp" | "google";
  lastProcessDate?: Date;
  processError?: "rateLimit" | "notValidResponse" | "parseError";
}

const ReviewSchema: Schema = new Schema<IReview>(
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
    images: [{ type: Schema.Types.ObjectId, ref: "Media" }],
    videos: [{ type: Schema.Types.ObjectId, ref: "Media" }],
    tags: [{ type: String, ref: "Tag" }],
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
  },
  { timestamps: true }
);

ReviewSchema.index({ place: 1 });

// dependency removal function
async function removeReviewDependencies(review: IReview) {
  // reduce the place reviewCount by 1
  await Place.updateOne(
    { _id: review.place, reviewCount: { $gt: 0 } },
    { $inc: { reviewCount: -1 } }
  );

  // remove all reactions related to the review
  const reactions = await Reaction.find({ target: review.userActivityId });
  await Promise.all(reactions.map((reaction) => reaction.deleteOne()));

  // remove all comments related to the review
  const comments = await Comment.find({
    userActivity: review.userActivityId,
  });
  await Promise.all(comments.map((comment) => comment.deleteOne()));

  // remove the userActivity related to the review
  const userActivity = await UserActivity.findById(review.userActivityId);
  if (userActivity) await userActivity.deleteOne();
}

// Query middleware (for Comment.deleteOne(), Comment.deleteMany(), etc.)
ReviewSchema.pre<IReview>(
  "deleteOne",
  { document: true, query: false },
  async function (next) {
    console.log("deleteOne review");
    try {
      const review = this as IReview;
      await removeReviewDependencies(review);
      next();
    } catch (error) {
      next(error as CallbackError);
    }
  }
);

ReviewSchema.pre("deleteOne", async function (next) {
  try {
    console.log("deleteOne review");
    const review = await this.model.findOne(this.getQuery());
    await removeReviewDependencies(review);
    next();
  } catch (error) {
    next(error as CallbackError);
  }
});

export default mongoose.models.Review ||
  mongoose.model<IReview>("Review", ReviewSchema);
