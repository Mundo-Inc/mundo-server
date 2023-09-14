import { PutObjectCommand } from "@aws-sdk/client-s3";
import axios from "axios";
import mongoose, { Document, Schema } from "mongoose";

import type { IGPPlaceDetails } from "../types/googleplaces.interface";
import { openAiAnalyzeReview } from "../utilities/openAi";
import { bucketName, region, s3 } from "../utilities/storage";
import Place from "./Place";
import Review from "./Review";
import User from "./User";

const API_TOKEN_LIMIT = 80000;
const API_KEY = process.env.GOOGLE_PLACES_API_KEY;

let tokens = 0;
const categories: string[] = [
  "bar",
  "restaurant",
  "cafe",
  "bakery",
  "meal_delivery",
  "meal_takeaway",
];

interface IQueue extends Document {
  googlePlaceId: string;
  type: "new" | "update";
  completed: {
    google: boolean;
    yelp: boolean;
  };
  isProcessing: boolean;
  processes: {
    google: {
      data: boolean;
      reviews: boolean;
    };
    yelp: {
      data: boolean;
      reviews: boolean;
    };
  };
}

const QueueSchema = new Schema<IQueue>(
  {
    googlePlaceId: {
      type: String,
      required: true,
      index: true,
      unique: true,
    },
    type: {
      type: String,
      enum: ["new", "update"],
      required: true,
    },
    completed: {
      google: {
        type: Boolean,
        default: false,
      },
      yelp: {
        type: Boolean,
        default: false,
      },
    },
    isProcessing: {
      type: Boolean,
      default: false,
    },
    processes: {
      google: {
        data: {
          type: Boolean,
          default: false,
        },
        reviews: {
          type: Boolean,
          default: false,
        },
      },
      yelp: {
        data: {
          type: Boolean,
          default: false,
        },
        reviews: {
          type: Boolean,
          default: false,
        },
      },
    },
  },
  {
    timestamps: true,
    methods: {
      async process() {
        let p_r, p_d;
        try {
          if (this.isProcessing) return;
          const placeRes = await axios(
            `https://maps.googleapis.com/maps/api/place/details/json?place_id=${this.googlePlaceId}&key=${API_KEY}`
          );
          const placeDetails = (placeRes.data as IGPPlaceDetails).result;

          const body: {
            [key: string]: any;
          } = {
            name: placeDetails.name,
            priceRange: placeDetails.price_level,
            phone:
              placeDetails.international_phone_number?.replace(
                /[^+0-9]/g,
                ""
              ) || null,
            categories: placeDetails.types?.filter((t) =>
              categories.includes(t)
            ),
            location: {},
            website: placeDetails.website,
            // isActive: placeDetails.business_status === "OPERATIONAL",
            isActive: true,
            otherSources: {
              googlePlaces: {
                _id: placeDetails.place_id,
                rating: placeDetails.rating,
                updatedAt: new Date(),
              },
            },
          };

          if (placeDetails.geometry) {
            body.location.geoLocation = {
              type: "Point",
              coordinates: [
                placeDetails.geometry.location.lng,
                placeDetails.geometry.location.lat,
              ],
            };
          }
          if (placeDetails.formatted_address) {
            body.location.address = placeDetails.formatted_address;
          }
          if (placeDetails.address_components) {
            body.location.city = placeDetails.address_components.find(
              (c) =>
                c.types.includes("locality") ||
                c.types.includes("administrative_area_level_1")
            )?.short_name;
            body.location.state = placeDetails.address_components.find((c) =>
              c.types.includes("administrative_area_level_1")
            )?.short_name;
            body.location.country = placeDetails.address_components.find((c) =>
              c.types.includes("country")
            )?.short_name;
            body.location.zip = placeDetails.address_components.find((c) =>
              c.types.includes("postal_code")
            )?.short_name;
          }

          const place = new Place(body);

          if (placeDetails.photos && placeDetails.photos.length > 0) {
            const thumbnailUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1600&photo_reference=${placeDetails.photos[0].photo_reference}&key=${process.env.GOOGLE_PLACES_API_KEY}`;
            const key =
              process.env.NODE_ENV === "production"
                ? `places/${place._id}/thumbnail.jpg`
                : `devplaces/${place._id}/thumbnail.jpg`;
            place.thumbnail = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;
            axios
              .get(thumbnailUrl, { responseType: "arraybuffer" })
              .then((response) => {
                const buffer = Buffer.from(response.data);
                s3.send(
                  new PutObjectCommand({
                    Bucket: bucketName,
                    Key: key,
                    Body: buffer,
                    ContentType: "image/jpeg",
                  })
                );
              })
              .catch((error) => {
                console.error("There was an error:", error);
              });
          }

          await place.save();

          const reviewsArray: {
            author_name: string;
            time: number;
          }[] = [];

          addReviews(placeDetails, place, reviewsArray);

          if (placeDetails.reviews && placeDetails.reviews.length >= 4) {
            fetch(
              `https://maps.googleapis.com/maps/api/place/details/json?place_id=${this.googlePlaceId}&reviews_sort=newest&key=${process.env.GOOGLE_PLACES_API_KEY}`
            )
              .then(async (placeRes) => {
                const placeDetails = (
                  (await placeRes.json()) as IGPPlaceDetails
                ).result;
                addReviews(placeDetails, place, reviewsArray);
              })
              .catch((err) => {
                console.log(err);
              });
          }

          this.processes.google.data = true;
          this.processes.google.reviews = true;
          this.completed.google = true;
          this.save();
        } catch (error) {
          if (p_d) {
            this.processes.google.data = true;
          }
          if (p_r) {
            this.processes.google.reviews = true;
          }
          this.save();
        }
      },
    },
  }
);

export default mongoose.models.Queue ||
  mongoose.model<IQueue>("Queue", QueueSchema);

function addReviews(
  placeDetails: IGPPlaceDetails["result"],
  place: any,
  reviewsArray: any[]
) {
  if (placeDetails.reviews) {
    const reviews = placeDetails.reviews;
    User.find({
      role: "user",
      source: "yelp",
    })
      .skip(Math.floor(Math.random() * 4990))
      .limit(6)
      .lean()
      .then(async (fakeUsers) => {
        let i = 0;

        let processed = false;
        let processedReviews = 0;
        const reviewsLength = reviews.filter((r) => r.text?.length > 5).length;
        for (const review of reviews) {
          if (!review.text || review.text.length <= 5) {
            continue;
          }
          if (
            reviewsArray.find(
              (r) =>
                r.time === review.time && r.author_name === review.author_name
            )
          ) {
            continue;
          }
          await Review.create({
            place: place._id,
            writer: fakeUsers[i]._id,
            content: review.text,
            scores: {
              overall: review.rating,
            },
            language: review.language?.includes("en")
              ? "en"
              : review.language || "en",
            createdAt: new Date(review.time * 1000),
            source: "google",
          }).then(async (r) => {
            reviewsArray.push({
              author_name: review.author_name,
              time: review.time,
            });
            openAiAnalyzeReview(r.content, {
              rewrite: true,
              fullScores: true,
            }).then(async ({ error, scores, tags, rewrite }) => {
              processedReviews++;
              r.lastProcessDate = new Date();
              if (error) {
                if (rewrite && rewrite.length > 5) {
                  r.originalContent = r.content;
                  r.content = rewrite;
                }
                r.error = error;
                await r.save();
              } else {
                const finalScore: {
                  [key: string]: number;
                } = scores ? { ...scores } : {};
                for (const key in r.scores) {
                  if (r.scores[key]) {
                    finalScore[key] = r.scores[key];
                  }
                }
                r.scores = finalScore;
                r.tags = tags;
                if (rewrite && rewrite.length > 5) {
                  r.originalContent = r.content;
                  r.content = rewrite;
                }
                await r.save();
              }
              if (processedReviews === reviewsLength) {
                processed = true;
                place.processReviews();
              }
            });
          });
          i++;
        }

        setTimeout(() => {
          if (!processed) {
            place.processReviews();
          }
        }, 30000);
      });
  }
}
