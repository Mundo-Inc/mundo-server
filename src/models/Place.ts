import mongoose, { Schema, type Model } from "mongoose";

import { OtherScoresSchema, type IOtherSources } from "./Place/OtherSources.js";
import { ScoresSchema, type IScores } from "./Place/Scores.js";
import Review from "./Review.js";

const GOOGLE_PLACES_PERCENTAGE = 0.3;

export interface IPlace {
  _id: mongoose.Types.ObjectId;
  name: string;
  otherNames: string[];
  description: string;
  thumbnail?: string;
  priceRange?: number;
  location: {
    geoLocation: {
      type: string;
      coordinates: number[];
    }; // { type: "Point", coordinates: [ longitude, latitude ] }
    address: string;
    city: string;
    state: string;
    country: string;
    house_number: string;
    zip: string;
  };
  scores: IScores;
  popularity: {
    googlePlacesReviewCount?: number;
    yelpReviewCount?: number;
  };
  phone: string;
  website?: string;
  categories: string[];
  amenity: string;
  cuisine: string[];
  owner?: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  addedBy?: mongoose.Types.ObjectId;
  activities: {
    reviewCount: number;
    checkinCount: number;
  };
  otherSources: IOtherSources;
  isCustom?: boolean;
}

interface IPlaceMethods {
  processReviews(): Promise<void>;
}

type PlaceModel = Model<IPlace, {}, IPlaceMethods>;

const PlaceSchema = new Schema<IPlace, PlaceModel, IPlaceMethods>(
  {
    name: {
      type: String,
      required: true,
    },
    otherNames: {
      type: [String],
      default: [],
    },
    description: {
      type: String,
      default: "",
    },
    thumbnail: {
      type: String,
      default: "",
    },
    priceRange: {
      type: Number,
    },
    amenity: String,
    cuisine: {
      type: [String],
      default: [],
    },
    popularity: {
      googlePlacesReviewCount: { type: Number },
      yelpReviewCount: { type: Number },
    },
    location: {
      geoLocation: {
        type: { type: String, default: "Point" },
        coordinates: { type: [Number], required: true },
      }, // { type: "Point", coordinates: [ longitude, latitude ] },
      address: {
        type: String,
        trim: true,
        // required: true,
      },
      city: {
        type: String,
        trim: true,
      },
      state: {
        type: String,
        trim: true,
      },
      country: {
        type: String,
        trim: true,
      },
      zip: {
        type: String,
        trim: true,
      },
      house_number: {
        type: String,
        trim: true,
      },
    },
    scores: {
      type: ScoresSchema,
      default: {
        updatedAt: new Date(),
      },
    },
    phone: {
      type: String,
      trim: true,
    },
    website: {
      type: String,
      trim: true,
    },
    categories: {
      type: [String],
      default: [],
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    addedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    otherSources: OtherScoresSchema,
    activities: {
      reviewCount: {
        type: Number,
        default: 0,
      },
      checkinCount: {
        type: Number,
        default: 0,
      },
    },
    isCustom: {
      type: Boolean,
    },
  },
  {
    timestamps: true,
    methods: {
      async processReviews() {
        const scores = await Review.aggregate([
          {
            $match: {
              place: this._id,
            },
          },
          {
            $group: {
              _id: "$place",
              overall: { $avg: "$scores.overall" },
              drinkQuality: { $avg: "$scores.drinkQuality" },
              foodQuality: { $avg: "$scores.foodQuality" },
              atmosphere: { $avg: "$scores.atmosphere" },
              service: { $avg: "$scores.service" },
              value: { $avg: "$scores.value" },
              count: {
                $sum: 1,
              },
            },
          },
          {
            $addFields: {
              phantom: {
                $multiply: [
                  {
                    $sum: [
                      "$drinkQuality",
                      "$foodQuality",
                      "$atmosphere",
                      "$service",
                      "$value",
                    ],
                  },
                  {
                    $cond: {
                      if: {
                        $lte: [
                          {
                            $log: [
                              {
                                $sum: ["$count", 1],
                              },
                              2,
                            ],
                          },
                          2,
                        ],
                      },
                      then: {
                        $log: [
                          {
                            $sum: ["$count", 1],
                          },
                          2,
                        ],
                      },
                      else: 2,
                    },
                  },
                  2,
                ],
              },
            },
          },
          {
            $project: {
              _id: 0,
              overall: 1,
              drinkQuality: 1,
              foodQuality: 1,
              atmosphere: 1,
              service: 1,
              value: 1,
              phantom: 1,
              count: 1,
            },
          },
        ]);

        let scoreCount = 5;
        for (const key in scores[0]) {
          if (!scores[0][key]) {
            scoreCount--;
          }
        }

        if (scores[0]) {
          if (scoreCount < 5) {
            scores[0].phantom = Math.abs((scores[0].phantom * 5) / scoreCount);
          }

          if (this.otherSources.googlePlaces?.rating) {
            scores[0].overall = this.otherSources.googlePlaces.rating;

            scores[0].phantom =
              this.otherSources.googlePlaces.rating *
                20 *
                GOOGLE_PLACES_PERCENTAGE +
              scores[0].phantom * (1 - GOOGLE_PLACES_PERCENTAGE);
          }

          this.activities.reviewCount = scores[0].count;
          delete scores[0].count;
          this.scores = scores[0];
          this.scores.updatedAt = new Date();
          await this.save();
        }
      },
    },
  }
);

PlaceSchema.index({ name: "text" });
PlaceSchema.index({ "location.geoLocation": "2dsphere" });
PlaceSchema.index({ "scores.overall": -1 });
PlaceSchema.index({ "scores.phantom": -1 });
PlaceSchema.index({ "otherSources.appleMaps._id": 1 });
PlaceSchema.index({ "otherSources.googlePlaces._id": 1 });

const model =
  (mongoose.models.Place as PlaceModel) ||
  mongoose.model<IPlace, PlaceModel>("Place", PlaceSchema);

export default model;
