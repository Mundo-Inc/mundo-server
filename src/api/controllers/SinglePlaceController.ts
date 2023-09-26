import { IGPReview } from "./../../types/googleplaces.interface";
import type { NextFunction, Request, Response } from "express";
import { param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose, { Mongoose } from "mongoose";
import Place, { IPlace } from "../../models/Place";
import { dStrings, dynamicMessage } from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
var levenshtein = require("fast-levenshtein");
var country = require("countrystatesjs");
var iso3311a2 = require("iso-3166-1-alpha-2");

import { publicReadUserProjectionAG } from "../dto/user/read-user-public.dto";
import {
  findGooglePlacesId,
  findYelpId,
  getGooglePlacesData,
  getYelpData,
  getYelpReviews,
} from "../services/provider.service";

export const getPlaceValidation: ValidationChain[] = [
  param("id").isMongoId().withMessage("Invalid place id"),
  query("reviewSort")
    .optional()
    .isIn(["newest", "oldest"])
    .withMessage("Invalid review sort"),
];
export async function getPlace(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authId = req.user?.id;
    const { id } = req.params;

    const reviewSort = req.query.reviewSort as "newest" | "oldest";

    let userReactionPipeline: any = {};
    if (req.user) {
      userReactionPipeline = {
        user: [
          {
            $match: {
              user: new mongoose.Types.ObjectId(req.user.id),
            },
          },
          {
            $project: {
              _id: 1,
              type: 1,
              reaction: 1,
              createdAt: 1,
            },
          },
        ],
      };
    }

    const response = await Place.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(id as string),
        },
      },
      {
        $lookup: {
          from: "reviews",
          localField: "_id",
          foreignField: "place",
          as: "reviews",
          pipeline: [
            {
              $sort: {
                createdAt: reviewSort === "oldest" ? 1 : -1,
              },
            },
            {
              $match: {
                content: { $exists: true, $ne: "" },
              },
            },
            {
              $limit: 5,
            },
            {
              $lookup: {
                from: "users",
                localField: "writer",
                foreignField: "_id",
                as: "writer",
                pipeline: [
                  {
                    $project: publicReadUserProjectionAG,
                  },
                ],
              },
            },
            {
              $lookup: {
                from: "media",
                localField: "images",
                foreignField: "_id",
                as: "images",
                pipeline: [
                  {
                    $project: {
                      _id: 1,
                      src: 1,
                      caption: 1,
                      type: 1,
                    },
                  },
                ],
              },
            },
            {
              $lookup: {
                from: "media",
                localField: "videos",
                foreignField: "_id",
                as: "videos",
                pipeline: [
                  {
                    $project: {
                      _id: 1,
                      src: 1,
                      caption: 1,
                      type: 1,
                    },
                  },
                ],
              },
            },
            {
              $lookup: {
                from: "reactions",
                let: {
                  userActivityId: "$userActivityId",
                },
                as: "reactions",
                pipeline: [
                  {
                    $match: {
                      $expr: { $eq: ["$target", "$$userActivityId"] },
                    },
                  },
                  {
                    $facet: {
                      total: [
                        {
                          $group: {
                            _id: "$reaction",
                            count: { $sum: 1 },
                            type: { $first: "$type" },
                          },
                        },
                        {
                          $project: {
                            _id: 0,
                            reaction: "$_id",
                            type: 1,
                            count: 1,
                          },
                        },
                      ],
                      ...userReactionPipeline,
                    },
                  },
                ],
              },
            },
            {
              $lookup: {
                from: "comments",
                localField: "userActivityId",
                foreignField: "userActivity",
                as: "comments",
                pipeline: [
                  {
                    $match: {
                      status: "active",
                    },
                  },
                  {
                    $limit: 3,
                  },
                  {
                    $lookup: {
                      from: "users",
                      localField: "author",
                      foreignField: "_id",
                      as: "author",
                      pipeline: [
                        {
                          $project: {
                            _id: 1,
                            name: 1,
                            username: 1,
                            level: 1,
                            profileImage: 1,
                            verified: 1,
                          },
                        },
                      ],
                    },
                  },
                  {
                    $project: {
                      _id: 1,
                      createdAt: 1,
                      updatedAt: 1,
                      content: 1,
                      mentions: 1,
                      author: { $arrayElemAt: ["$author", 0] },
                      likes: { $size: "$likes" },
                      liked: authId
                        ? {
                            $in: [
                              new mongoose.Types.ObjectId(authId),
                              "$likes",
                            ],
                          }
                        : false,
                    },
                  },
                ],
              },
            },
            {
              $project: {
                scores: 1,
                content: 1,
                images: 1,
                videos: 1,
                tags: 1,
                language: 1,
                recommend: 1,
                createdAt: 1,
                updatedAt: 1,
                userActivityId: 1,
                writer: { $arrayElemAt: ["$writer", 0] },
                reactions: {
                  $arrayElemAt: ["$reactions", 0],
                },
                comments: 1,
              },
            },
          ],
        },
      },
      {
        $lookup: {
          from: "media",
          localField: "_id",
          foreignField: "place",
          as: "images",
          pipeline: [
            {
              $limit: 5,
            },
            {
              $project: {
                src: 1,
                caption: 1,
                type: 1,
              },
            },
          ],
        },
      },
      {
        $project: {
          name: 1,
          otherNames: 1,
          thumbnail: 1,
          images: 1,
          scores: 1,
          reviews: 1,
          reviewCount: 1,
          priceRange: 1,
          description: 1,
          location: {
            geoLocation: {
              lng: {
                $arrayElemAt: ["$location.geoLocation.coordinates", 0],
              },
              lat: {
                $arrayElemAt: ["$location.geoLocation.coordinates", 1],
              },
            },
            address: 1,
            city: 1,
            state: 1,
            country: 1,
            zip: 1,
          },
          phone: 1,
          website: 1,
          categories: 1,
        },
      },
    ]);

    if (response.length === 0) {
      throw createError(
        dynamicMessage(dStrings.notFound, "Place"),
        StatusCodes.NOT_FOUND
      );
    }

    const thirdPartyData = await fetchThirdPartiesData(id);

    if (!response[0].scores.phantom) {
      //TODO: add update condition for outdated scores
      //updatePhantomScore()
    }

    if (response[0].reviewCount < 4) {
      delete response[0].scores.phantom;
    }

    response[0].thirdParty = thirdPartyData;

    res.status(StatusCodes.OK).json({
      success: true,
      data: response[0],
    });
  } catch (err) {
    next(err);
  }
}

async function fetchThirdPartiesData(id: string) {
  try {
    const place = await Place.findById(id);
    const results = await Promise.all([
      fetchGoogle(place, true),
      fetchYelp(place, true),
    ]);
    return { ...results[0], ...results[1] };
  } catch (error) {
    console.error("An error occurred:", error);
    throw error; // Re-throw the error after logging it
  }
}

async function fetchYelp(place: IPlace, getReviews: boolean) {
  try {
    let yelpId = place.otherSources?.yelp?._id;
    let reviews = [];
    let rating = -1;
    let reviewCount = 0;
    if (typeof yelpId === "string" && yelpId !== "") {
      const yelpData = await getYelpData(yelpId);
      rating = yelpData.rating;
      reviewCount = yelpData.reviewCount;
    } else {
      // Getting the yelpId
      yelpId = await findYelpId(place);
      if (typeof yelpId === "string" && yelpId !== "") {
        // Storing the yelpId
        place.otherSources.yelp = { _id: yelpId };
        await place.save();
        // Returning the yelpRating
        const yelpData = await getYelpData(yelpId);
        rating = yelpData.rating;
        reviewCount = yelpData.reviewCount;
      }
    }
    if (getReviews && typeof yelpId === "string" && yelpId !== "") {
      reviews = (await getYelpReviews(yelpId)).reviews;
    }
    return {
      yelp: {
        rating,
        reviewCount,
        reviews,
      },
    };
  } catch (error) {
    return { yelp: null };
  }
}

async function fetchGoogle(place: IPlace, getReviews: boolean) {
  try {
    let googlePlacesId = place.otherSources?.googlePlaces?._id;
    let googlePlacesData;
    let reviews: IGPReview[] | undefined = [];
    let rating = -1;
    let reviewCount = 0;
    if (typeof googlePlacesId === "string" && googlePlacesId !== "") {
      googlePlacesData = await getGooglePlacesData(googlePlacesId);
      googlePlacesData.rating && (rating = googlePlacesData.rating);
      googlePlacesData.user_ratings_total &&
        (reviewCount = googlePlacesData.user_ratings_total);
    } else {
      // Getting the googlePlacesId
      //@ts-ignore
      googlePlacesId = await findGooglePlacesId(place);

      if (typeof googlePlacesId === "string" && googlePlacesId !== "") {
        // Storing the googlePlaceId
        place.otherSources.googlePlaces = { _id: googlePlacesId };
        await place.save();
        // Returning the googlePlacesRating
        googlePlacesData = await getGooglePlacesData(googlePlacesId);
        googlePlacesData.rating && (rating = googlePlacesData.rating);
        googlePlacesData.user_ratings_total &&
          (reviewCount = googlePlacesData.user_ratings_total);
      }
    }
    if (getReviews) {
      reviews = googlePlacesData?.reviews;
    }
    return {
      google: {
        rating,
        reviewCount,
        reviews,
      },
    };
  } catch (error) {
    return { google: null };
  }
}
