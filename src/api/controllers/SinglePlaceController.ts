import type { NextFunction, Request, Response } from "express";
import { param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import Media from "../../models/Media";
import Place, { IPlace } from "../../models/Place";
import Review from "../../models/Review";
import { dStrings, dynamicMessage } from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { publicReadUserProjectionAG } from "../dto/user/read-user-public.dto";
import {
  findGooglePlacesId,
  findYelpId,
  getGooglePlacesData,
  getYelpData,
  getYelpReviews,
} from "../services/provider.service";
import { IGPReview } from "./../../types/googleplaces.interface";
import validate from "./validators";

// var levenshtein = require("fast-levenshtein");
// var country = require("countrystatesjs");
// var iso3311a2 = require("iso-3166-1-alpha-2");

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
        // ! Reviews can be removed when we switch to the new app. Get reviews from it's own API
        $lookup: {
          from: "reviews",
          localField: "_id",
          foreignField: "place",
          as: "reviews",
          pipeline: [
            {
              $match: {
                content: { $exists: true, $ne: "" },
              },
            },
            {
              $sort: {
                createdAt: reviewSort === "oldest" ? 1 : -1,
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
                          $project: publicReadUserProjectionAG,
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
                      ...(authId
                        ? {
                            liked: {
                              $in: [
                                new mongoose.Types.ObjectId(authId),
                                "$likes",
                              ],
                            },
                          }
                        : {}),
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
          as: "media",
          pipeline: [
            {
              // Prioritizing videos over images
              $sort: {
                type: -1,
              },
            },
            {
              $limit: 5,
            },
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
        $project: {
          name: 1,
          amenity: 1,
          otherNames: 1,
          thumbnail: 1,
          media: 1,
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

    response[0].thumbnail =
      thirdPartyData.google?.thumbnail || thirdPartyData.yelp?.thumbnail;

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
    if (results[0].google?.reviewCount)
      place.popularity.googlePlacesReviewCount = results[0].google?.reviewCount;
    if (results[1].yelp?.reviewCount)
      place.popularity.yelpReviewCount = results[1].yelp?.reviewCount;
    await place.save();
    return { ...results[0], ...results[1] };
  } catch (error) {
    console.error("An error occurred:", error);
    throw error; // Re-throw the error after logging it
  }
}

export const getPlaceMediaValidation: ValidationChain[] = [
  param("id").isMongoId().withMessage("Invalid place id"),
  query("type")
    .optional()
    .isIn(["image", "video"])
    .withMessage("Invalid media type"),
  query("priority")
    .optional()
    .custom((_, { req }) => {
      // error if type is specified too
      if (req.query?.type) {
        throw new Error("Cannot specify both type and priority");
      }
      return true;
    })
    .withMessage("Cannot specify both type and priority")
    .isIn(["image", "video"])
    .withMessage("Invalid media type"),
  validate.limit(query("limit").optional(), 1, 30),
  validate.page(query("page").optional(), 50),
];
export async function getPlaceMedia(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id } = req.params;

    const limit = Number(req.query.limit) || 50;
    const page = Number(req.query.page) || 1;
    const skip = (page - 1) * limit;
    const type = req.query.type as "image" | "video" | undefined;
    const priority = req.query.priority as "image" | "video" | undefined;

    const priorityPipeline: any = [];

    if (priority) {
      priorityPipeline.push({
        $sort: {
          type: priority === "image" ? 1 : -1,
        },
      });
    }

    const media = await Media.aggregate([
      {
        $match: {
          place: new mongoose.Types.ObjectId(id as string),
          ...(type ? { type } : {}),
        },
      },
      ...priorityPipeline,
      {
        $facet: {
          total: [
            {
              $count: "count",
            },
          ],
          media: [
            {
              $skip: skip,
            },
            {
              $limit: limit,
            },
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
    ]);

    res.status(StatusCodes.OK).json({
      success: true,
      total: media[0].total[0]?.count || 0,
      data: media[0].media || [],
    });
  } catch (err) {
    next(err);
  }
}

export const getPlaceReviewsValidation: ValidationChain[] = [
  param("id").isMongoId().withMessage("Invalid place id"),
  validate.limit(query("limit").optional(), 1, 30),
  validate.page(query("page").optional(), 50),
];
export async function getPlaceReviews(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authId = req.user?.id;
    const { id } = req.params;

    const limit = Number(req.query.limit) || 20;
    const page = Number(req.query.page) || 1;
    const skip = (page - 1) * limit;

    let userReactionPipeline: any = {};
    if (authId) {
      userReactionPipeline = {
        user: [
          {
            $match: {
              user: new mongoose.Types.ObjectId(authId),
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

    const total = await Review.countDocuments({
      place: new mongoose.Types.ObjectId(id as string),
    });

    const results = await Review.aggregate([
      {
        $match: {
          place: new mongoose.Types.ObjectId(id as string),
        },
      },
      {
        $match: {
          content: { $exists: true, $ne: "" },
        },
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
      {
        $skip: skip,
      },
      {
        $limit: limit,
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
                    $project: publicReadUserProjectionAG,
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
                ...(authId
                  ? {
                      liked: {
                        $in: [new mongoose.Types.ObjectId(authId), "$likes"],
                      },
                    }
                  : {}),
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
    ]);

    res.status(StatusCodes.OK).json({
      success: true,
      total: total,
      data: results || [],
    });
  } catch (err) {
    next(err);
  }
}

async function fetchYelp(place: IPlace, getReviews: boolean) {
  try {
    let yelpId = place.otherSources?.yelp?._id;
    let reviews = [];
    let rating = -1;
    let reviewCount = 0;
    let thumbnail = "";

    if (typeof yelpId === "string" && yelpId !== "") {
      const yelpData = await getYelpData(yelpId);
      rating = yelpData.rating;
      reviewCount = yelpData.reviewCount;
      thumbnail = yelpData.thumbnail;
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
        thumbnail = yelpData.thumbnail;
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
        thumbnail,
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
    const thumbnail = googlePlacesData?.thumbnail;
    if (getReviews) {
      reviews = googlePlacesData?.reviews;
    }
    return {
      google: {
        rating,
        reviewCount,
        reviews,
        thumbnail,
      },
    };
  } catch (error) {
    return { google: null };
  }
}
