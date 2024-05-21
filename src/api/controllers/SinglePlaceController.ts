import type { NextFunction, Request, Response } from "express";
import { param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose, { type Document, type PipelineStage } from "mongoose";

import {
  GoogleDataManager,
  GooglePlaceFields,
  type GooglePlaceDetailsAdvanced,
  type GooglePlaceDetailsLocationOnly,
  type GooglePlaceDetailsPreferred,
  type GooglePlaceReview,
  type OpeningHours,
} from "../../DataManagers/GoogleDataManager.js";
import List from "../../models/List.js";
import Media from "../../models/Media.js";
import Place, { type IPlace } from "../../models/Place.js";
import Review from "../../models/Review.js";
import { dStrings, dynamicMessage } from "../../strings.js";
import type { IYelpPlaceDetails } from "../../types/yelpPlace.interface.js";
import {
  createError,
  handleInputErrors,
} from "../../utilities/errorHandlers.js";
import { filterObjectByConfig } from "../../utilities/filtering.js";
import { getPaginationFromQuery } from "../../utilities/pagination.js";
import UserProjection from "../dto/user.js";
import logger from "../services/logger/index.js";
import {
  findYelpId,
  getYelpData,
  getYelpReviews,
} from "../services/provider.service.js";
import validate from "./validators.js";

export const getPlaceValidation: ValidationChain[] = [
  param("id").isMongoId().withMessage("Invalid place id"),
];

export async function getPlace(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const id = new mongoose.Types.ObjectId(req.params.id);

    const response = await getDetailedPlace(id);

    res.status(StatusCodes.OK).json({
      success: true,
      data: response,
    });
  } catch (err) {
    next(err);
  }
}

export const getPlaceOverviewValidation: ValidationChain[] = [
  param("id").isMongoId().withMessage("Invalid place id"),
];

export async function getPlaceOverview(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const id = new mongoose.Types.ObjectId(req.params.id);

    const response = await Place.aggregate([
      {
        $match: {
          _id: id,
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
          activities: 1,
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
    ]).then((result) => result[0]);

    if (!response) {
      throw createError(
        dynamicMessage(dStrings.notFound, "Place"),
        StatusCodes.NOT_FOUND
      );
    }

    res.status(StatusCodes.OK).json({
      success: true,
      data: response,
    });
  } catch (err) {
    next(err);
  }
}

export async function getDetailedPlace(id: mongoose.Types.ObjectId) {
  const place = await Place.findById(id).orFail(
    createError(
      dynamicMessage(dStrings.notFound, "Place"),
      StatusCodes.NOT_FOUND
    )
  );

  const [googleResults, yelpResults] = await Promise.all([
    fetchGoogle(place),
    fetchYelp(place),
  ]);

  const thirdPartyData = {
    ...googleResults,
    ...yelpResults,
  };

  // Update place with thirdparty data
  const now = new Date();
  if (!place.otherSources) {
    place.otherSources = {};
  }
  if (thirdPartyData.google) {
    if (!place.otherSources.googlePlaces) {
      place.otherSources.googlePlaces = {
        _id: thirdPartyData.google.id,
        rating: thirdPartyData.google.rating,
        updatedAt: now,
      };
    } else {
      place.otherSources.googlePlaces.rating = thirdPartyData.google.rating;
      place.otherSources.googlePlaces.updatedAt = now;
    }
  }
  if (thirdPartyData.yelp) {
    if (!place.otherSources.yelp) {
      place.otherSources.yelp = {
        _id: thirdPartyData.yelp.id,
        rating: thirdPartyData.yelp.rating,
        updatedAt: now,
      };
    } else {
      place.otherSources.yelp.rating = thirdPartyData.yelp.rating;
      place.otherSources.yelp.updatedAt = now;
    }
  }

  await place.save();

  if (
    !place.scores ||
    !place.scores.phantom ||
    !place.scores.updatedAt ||
    (place.scores.updatedAt &&
      now.getTime() - place.scores.updatedAt.getTime() > 604800000)
  ) {
    // Run if place doesn't have phantom scores or it's been more than a week since the last update
    await place.processReviews();
  }

  const placeObject: any = place.toObject();

  // get 5 media items
  placeObject.media = await Media.find({ place: id })
    .sort({ type: -1, createdAt: -1 })
    .limit(5)
    .select("src caption type");

  // remove phantom scores if review count is less than 4
  if (placeObject.activities.reviewCount < 4 && placeObject.scores) {
    delete placeObject.scores.phantom;
  }

  placeObject.thirdParty = thirdPartyData;

  placeObject.thumbnail =
    thirdPartyData.google?.thumbnail || thirdPartyData.yelp?.thumbnail;

  const filteredPlace = filterObjectByConfig(placeObject, {
    _id: true,
    name: true,
    amenity: true,
    otherNames: true,
    thumbnail: true,
    media: true,
    scores: true,
    activities: true,
    priceRange: true,
    description: true,
    location: true,
    phone: true,
    website: true,
    categories: true,
    thirdParty: true,
  });

  filteredPlace.location.geoLocation = {
    lng: filteredPlace.location.geoLocation.coordinates[0],
    lat: filteredPlace.location.geoLocation.coordinates[1],
  };

  return filteredPlace;
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
  validate.limit(query("limit").optional(), 1, 50),
  validate.page(query("page").optional(), 50),
];

export async function getPlaceMedia(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const id = new mongoose.Types.ObjectId(req.params.id);

    const { page, limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 20,
      maxLimit: 50,
    });

    const type = req.query.type as "image" | "video" | undefined;
    const priority = req.query.priority as "image" | "video" | undefined;

    const priorityPipeline: PipelineStage[] = [];

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
          place: id,
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
              $lookup: {
                from: "users",
                localField: "user",
                foreignField: "_id",
                as: "user",
                pipeline: [
                  {
                    $project: UserProjection.essentials,
                  },
                ],
              },
            },
            {
              $project: {
                _id: 1,
                src: 1,
                caption: 1,
                type: 1,
                user: { $arrayElemAt: ["$user", 0] },
              },
            },
          ],
        },
      },
    ]);

    res.status(StatusCodes.OK).json({
      success: true,
      data: media[0].media || [],
      pagination: {
        totalCount: media[0].total[0]?.count || 0,
        page,
        limit,
      },
    });
  } catch (err) {
    next(err);
  }
}

export const getPlaceReviewsValidation: ValidationChain[] = [
  param("id").isMongoId().withMessage("Invalid place id"),
  query("type").optional().isIn(["phantom", "googlePlaces", "yelp"]),
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

    const authUser = req.user;

    const id = new mongoose.Types.ObjectId(req.params.id);

    const type = (req.query.type || "phantom") as
      | "phantom"
      | "googlePlaces"
      | "yelp";

    if (type === "googlePlaces") {
      const place = await Place.findById(id)
        .orFail(
          createError(
            dynamicMessage(dStrings.notFound, "Place"),
            StatusCodes.NOT_FOUND
          )
        )
        .lean();

      let reviews: GooglePlaceReview[] = [];

      if (place.otherSources?.googlePlaces?._id) {
        const googleData =
          await GoogleDataManager.getPlaceDetails<GooglePlaceDetailsPreferred>(
            place.otherSources.googlePlaces._id,
            [GooglePlaceFields.PREFERRED]
          );
        if (googleData.reviews) {
          reviews = googleData.reviews;
        }
      }

      res.status(StatusCodes.OK).json({
        success: true,
        data: reviews,
      });
    } else if (type === "yelp") {
      const place = await Place.findById(id)
        .orFail(
          createError(
            dynamicMessage(dStrings.notFound, "Place"),
            StatusCodes.NOT_FOUND
          )
        )
        .lean();

      let reviews = [];

      if (place.otherSources?.yelp?._id) {
        reviews = await getYelpReviews(place.otherSources.yelp._id);
      }

      res.status(StatusCodes.OK).json({
        success: true,
        data: reviews,
      });
    } else {
      const { page, limit, skip } = getPaginationFromQuery(req, {
        defaultLimit: 20,
        maxLimit: 30,
      });

      let userReactionPipeline: Record<string, PipelineStage[]> = {};
      if (authUser) {
        userReactionPipeline = {
          user: [
            {
              $match: {
                user: authUser._id,
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
        place: id,
      });

      const results = await Review.aggregate([
        {
          $match: {
            place: id,
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
                $project: UserProjection.essentials,
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
                      $project: UserProjection.essentials,
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
                  ...(authUser
                    ? {
                        liked: {
                          $in: [authUser._id, "$likes"],
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
        data: results || [],
        pagination: {
          totalCount: total,
          page,
          limit,
        },
      });
    }
  } catch (err) {
    next(err);
  }
}

export const getExistInListsValidation: ValidationChain[] = [
  param("id").isMongoId().withMessage("Invalid place id"),
];
export async function getExistInLists(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const id = new mongoose.Types.ObjectId(req.params.id);

    const lists = await List.find({
      "collaborators.user": authUser._id,
      "places.place": id,
    })
      .select("_id")
      .lean();

    const result = lists.map((obj) => obj._id);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function fetchYelp(place: IPlace & Document<any, any, IPlace>) {
  try {
    let yelpId = place.otherSources?.yelp?._id;
    let yelpData: IYelpPlaceDetails | undefined;

    if (typeof yelpId === "string" && yelpId !== "") {
      yelpData = await getYelpData(yelpId);
    } else {
      // Getting the yelpId
      yelpId = await findYelpId(place);
      if (typeof yelpId === "string" && yelpId !== "") {
        // Storing the yelpId
        place.otherSources.yelp = { _id: yelpId };
        await place.save();
        // Returning the yelpRating
        yelpData = await getYelpData(yelpId);
      }
    }

    if (!yelpData) {
      return { yelp: null };
    }

    if (yelpData.review_count) {
      place.popularity.yelpReviewCount = yelpData.review_count;
    }

    await place.save();

    return {
      yelp: {
        id: yelpData.id,
        url: yelpData.url,
        rating: parseFloat(yelpData.rating || "-1"),
        reviewCount: yelpData.review_count,
        thumbnail: yelpData.image_url || null,
        photos: yelpData.photos || [],
        categories: yelpData.categories,
        transactions: yelpData.transactions,
        phone: yelpData.display_phone,
        price: yelpData.price,
      },
    };
  } catch (error) {
    return { yelp: null };
  }
}

async function fetchGoogle(place: IPlace & Document<any, any, IPlace>) {
  try {
    let googlePlacesId = place.otherSources?.googlePlaces?._id;
    let googlePlacesData;
    let openingHours:
      | (OpeningHours & {
          weekdayText?: string[];
        })
      | null = null;
    let categories;

    if (typeof googlePlacesId === "string" && googlePlacesId !== "") {
      googlePlacesData =
        await GoogleDataManager.getPlaceDetails<GooglePlaceDetailsAdvanced>(
          googlePlacesId,
          [GooglePlaceFields.ADVANCED]
        );

      if (googlePlacesData.regularOpeningHours) {
        openingHours = googlePlacesData.regularOpeningHours;
      }
    } else {
      // Getting the googlePlacesId
      googlePlacesId = await GoogleDataManager.getPlaceId(place.name, {
        lat: place.location.geoLocation.coordinates[1],
        lng: place.location.geoLocation.coordinates[0],
      });

      // Storing the googlePlaceId
      if (!place.otherSources) place.otherSources = {};
      place.otherSources.googlePlaces = { _id: googlePlacesId };
      await place.save();

      googlePlacesData = await GoogleDataManager.getPlaceDetails<
        GooglePlaceDetailsLocationOnly & GooglePlaceDetailsAdvanced
      >(googlePlacesId, [
        GooglePlaceFields.LOCATION,
        GooglePlaceFields.ADVANCED,
      ]);

      if (googlePlacesData.regularOpeningHours) {
        openingHours = googlePlacesData.regularOpeningHours;
      }

      const { state, city, country, postalCode, address } =
        GoogleDataManager.getAddressesFromComponents(
          googlePlacesData.addressComponents
        );

      if (address) {
        place.location.address = address;
        place.location.city = city;
        place.location.state = state;
        place.location.zip = postalCode;
        place.location.country = country;
      }

      if (googlePlacesData.types) {
        categories = googlePlacesData.types;
      }
    }

    let thumbnail = null;
    if (googlePlacesData.photos && googlePlacesData.photos.length > 0) {
      try {
        const photoName = googlePlacesData.photos[0].name;
        const url = await GoogleDataManager.getPhoto(photoName, 800, 800);
        thumbnail = url;
      } catch (error) {
        logger.error("Error fetching google photo", { error });
      }
    }

    if (googlePlacesData.userRatingCount) {
      place.popularity.googlePlacesReviewCount =
        googlePlacesData.userRatingCount;
    }

    await place.save();

    return {
      google: {
        id: googlePlacesId,
        rating: googlePlacesData.rating || -1,
        reviewCount: googlePlacesData.userRatingCount || 0,
        openingHours,
        thumbnail,
        categories,
      },
    };
  } catch (error) {
    return { google: null };
  }
}
