import mongoose, { Schema, type Document } from "mongoose";

import Review from "./Review";

const GOOGLE_PLACES_PERCENTAGE = 0.3;

interface IScores {
  overall: number;
  drinkQuality: number;
  foodQuality: number;
  atmosphere: number;
  service: number;
  value: number;
  phantom: number;
  updatedAt: Date;
}

const scoresSchema = new Schema<IScores>(
  {
    overall: { type: Number, min: 0, max: 5 },
    drinkQuality: { type: Number, min: 0, max: 5 },
    foodQuality: { type: Number, min: 0, max: 5 },
    atmosphere: { type: Number, min: 0, max: 5 },
    service: { type: Number, min: 0, max: 5 },
    value: { type: Number, min: 0, max: 5 },
    phantom: { type: Number },
    updatedAt: { type: Date },
  },
  { _id: false }
);

export interface IPlace extends Document {
  name: string;
  otherNames: string[];
  description: string;
  thumbnail?: string;
  priceRange?: number;
  reviewCount: number;
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
  yelpId?: string;
  createdAt: Date;
  updatedAt: Date;
  addedBy?: mongoose.Types.ObjectId;
  activities: {
    reviewCount: number;
    checkinCount: number;
  };
  otherSources: {
    OSM: {
      _id?: {
        type: string;
        unique: true;
      };
      tags: {
        air_conditioning?: boolean;
        amenity?: string;
        brand?: string;
        instagram?: string;
        phone?: string;
        website?: string;
        cuisine?: string;
        delivery?: boolean;
        internet_access?: boolean;
        opening_hours?: string;
        takeaway?: boolean;
        wheelchair?: boolean;
      };
      updatedAt?: Date;
    };
    googlePlaces: {
      _id?: {
        type: string;
        unique: true;
      };
      streetNumber?: string;
      streetName?: string;
      city?: string;
      state?: string;
      zip?: string;
      country?: string;
      address?: string;
      categories?: string[];
      rating?: number;
      updatedAt?: Date;
    };
    yelp: {
      _id?: {
        type: string;
        unique: true;
      };
      rating?: number;
      updatedAt?: Date;
    };
    tripadvisor: {
      _id?: {
        type: string;
        unique: true;
      };
      rating?: number;
      updatedAt?: Date;
    };
    foursquare: {
      _id?: {
        type: string;
        unique: true;
      };
      rating?: number;
      updatedAt?: Date;
    };
  };
}

const PlaceSchema: Schema = new Schema<IPlace>(
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
    reviewCount: {
      type: Number,
      default: 0,
    },
    scores: {
      type: scoresSchema,
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
    yelpId: {
      type: String,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    addedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    otherSources: {
      OSM: {
        type: {
          _id: String,
          tags: {
            air_conditioning: String,
            amenity: String,
            brand: String,
            instagram: String,
            phone: String,
            website: String,
            cuisine: String,
            delivery: String,
            internet_access: String,
            opening_hours: String,
            takeaway: String,
            wheelchair: String,
          },
          updatedAt: Date,
        },
        default: {
          _id: "",
        },
      },
      googlePlaces: {
        type: {
          _id: {
            type: String,
            default: "",
            index: true,
          },
          rating: Number,
          streetNumber: String,
          streetName: String,
          city: String,
          state: String,
          zip: String,
          country: String,
          address: String,
          categories: [String],
          updatedAt: Date,
        },
        default: {
          _id: "",
        },
      },
      yelp: {
        type: {
          _id: {
            type: String,
            default: "",
          },
          rating: Number,
          updatedAt: Date,
        },
        default: {
          _id: "",
        },
      },
    },
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

        if (scoreCount < 5) {
          scores[0].phantom = (scores[0].phantom * 5) / scoreCount;
        }

        if (scores[0]) {
          if (this.otherSources.googlePlaces.rating) {
            scores[0].overall = this.otherSources.googlePlaces.rating;

            scores[0].phantom =
              this.otherSources.googlePlaces.rating *
                20 *
                GOOGLE_PLACES_PERCENTAGE +
              scores[0].phantom * (1 - GOOGLE_PLACES_PERCENTAGE);
          }

          this.reviewCount = scores[0].count;
          delete scores[0].count;
          this.scores = scores[0];
          this.scores.updatedAt = new Date();
          await this.save();
        }
      },
    },
  }
);

PlaceSchema.index({ "location.geoLocation": "2dsphere" });
PlaceSchema.index({ "scores.overall": -1 });
PlaceSchema.index({ "scores.phantom": -1 });
PlaceSchema.index({ name: 1, priceRange: 1 });

export default mongoose.models.Place ||
  mongoose.model<IPlace>("Place", PlaceSchema);
