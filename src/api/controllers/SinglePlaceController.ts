import type { NextFunction, Request, Response } from "express";
import { param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import List from "../../models/List";
import Media from "../../models/Media";
import Place, { type IPlace } from "../../models/Place";
import Review from "../../models/Review";
import { dStrings, dynamicMessage } from "../../strings";
import type { IYelpPlaceDetails } from "../../types/yelpPlace.interface";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { extractComponentFromGoogleAddressComponents } from "../../utilities/providersHelper";
import { publicReadUserEssentialProjection } from "../dto/user/read-user-public.dto";
import logger from "../services/logger";
import {
  findGooglePlacesId,
  findYelpId,
  getGooglePlacesData,
  getYelpData,
  getYelpReviews,
} from "../services/provider.service";
import type { IGPReview } from "./../../types/googleplaces.interface";
import validate from "./validators";
import { filterObjectByConfig } from "../../utilities/filtering";

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

    const authId = req.user?.id;
    const { id } = req.params;

    const response = await getDetailedPlace(id);

    // TODO: remove after app update
    response.reviewCount = response.activities.reviewCount;

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

    const { id } = req.params;

    const response = await Place.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(id as string),
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
          media: 1, // TODO: should we keep this?
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
    ]);

    if (response.length === 0) {
      throw createError(
        dynamicMessage(dStrings.notFound, "Place"),
        StatusCodes.NOT_FOUND
      );
    }

    // TODO: remove after app update
    response[0].reviewCount = response[0].activities.reviewCount;

    res.status(StatusCodes.OK).json({
      success: true,
      data: response[0],
    });
  } catch (err) {
    next(err);
  }
}

export async function getDetailedPlace(id: string) {
  const place = await Place.findById(id);

  if (!place) {
    throw createError(
      dynamicMessage(dStrings.notFound, "Place"),
      StatusCodes.NOT_FOUND
    );
  }

  const thirdPartyData = await fetchThirdPartiesData(place);

  // Update place with thirdparty data
  const now = new Date();
  place.otherSources.googlePlaces.rating = thirdPartyData.google?.rating;
  place.otherSources.googlePlaces.updatedAt = now;
  place.otherSources.yelp.rating = thirdPartyData.yelp?.rating;
  place.otherSources.yelp.updatedAt = now;
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

  const placeObject = place.toObject();

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

async function fetchThirdPartiesData(place: IPlace) {
  const results = await Promise.all([
    fetchGoogle(place, true),
    fetchYelp(place, true),
  ]);

  return {
    ...results[0],
    ...results[1],
  };
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
              $lookup: {
                from: "users",
                localField: "user",
                foreignField: "_id",
                as: "user",
                pipeline: [
                  {
                    $project: publicReadUserEssentialProjection,
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
      total: media[0].total[0]?.count || 0,
      data: media[0].media || [],
    });
  } catch (err) {
    next(err);
  }
}

export const getPlaceExistsValidation: ValidationChain[] = [
  param("id").isMongoId().withMessage("Invalid place id"),
];

export async function getPlaceExists(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const { id } = req.params;
    let exists = Boolean(await Place.findById(id).lean());
    res.status(StatusCodes.OK).json({
      success: true,
      data: { exists },
    });
  } catch (err) {
    logger.error("error while checking a place's existance ", err);
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
              $project: publicReadUserEssentialProjection,
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
                    $project: publicReadUserEssentialProjection,
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
    const authId = req.user!.id;
    const { id } = req.params;

    const lists = await List.find({
      "collaborators.user": authId,
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

async function fetchYelp(place: IPlace, getReviews: boolean) {
  try {
    let yelpId = place.otherSources?.yelp?._id;
    let yelpData: IYelpPlaceDetails | undefined;
    let reviews = [];

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

    if (getReviews && typeof yelpId === "string" && yelpId !== "") {
      reviews = (await getYelpReviews(yelpId)).reviews;
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
        thumbnail: yelpData.image_url || "",
        photos: yelpData.photos || [],
        categories: yelpData.categories,
        transactions: yelpData.transactions,
        phone: yelpData.display_phone,
        price: yelpData.price,
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
    let opening_hours = {};
    let reviewCount = 0;
    let streetNumber,
      streetName,
      city,
      state,
      zip,
      country,
      address,
      categories;

    if (typeof googlePlacesId === "string" && googlePlacesId !== "") {
      googlePlacesData = await getGooglePlacesData(googlePlacesId);
      googlePlacesData.rating && (rating = googlePlacesData.rating);
      googlePlacesData.user_ratings_total &&
        (reviewCount = googlePlacesData.user_ratings_total);
      googlePlacesData.opening_hours &&
        (opening_hours = googlePlacesData.opening_hours);
      if (googlePlacesData.address_components) {
        streetNumber = extractComponentFromGoogleAddressComponents(
          googlePlacesData.address_components,
          "street_number"
        );
        streetName = extractComponentFromGoogleAddressComponents(
          googlePlacesData.address_components,
          "route"
        );
        state = extractComponentFromGoogleAddressComponents(
          googlePlacesData.address_components,
          "administrative_area_level_1",
          true
        ); // Use short format
        city = extractComponentFromGoogleAddressComponents(
          googlePlacesData.address_components,
          "locality"
        );
        if (!city || city === "") {
          city = state;
        }
        zip = extractComponentFromGoogleAddressComponents(
          googlePlacesData.address_components,
          "postal_code"
        );
        country = extractComponentFromGoogleAddressComponents(
          googlePlacesData.address_components,
          "country",
          true
        ); // Use short format
        address = `${streetNumber} ${streetName}`;
        if (googlePlacesData.types) {
          categories = [...googlePlacesData.types];
        }
      }
    } else {
      // Getting the googlePlacesId
      //@ts-ignore
      googlePlacesId = await findGooglePlacesId(place);

      if (typeof googlePlacesId === "string" && googlePlacesId !== "") {
        // Storing the googlePlaceId
        place.otherSources.googlePlaces = { _id: googlePlacesId };
        await place.save();
        googlePlacesData = await getGooglePlacesData(googlePlacesId);
        if (googlePlacesData && googlePlacesData.address_components) {
          streetNumber = extractComponentFromGoogleAddressComponents(
            googlePlacesData.address_components,
            "street_number"
          );
          streetName = extractComponentFromGoogleAddressComponents(
            googlePlacesData.address_components,
            "route"
          );
          state = extractComponentFromGoogleAddressComponents(
            googlePlacesData.address_components,
            "administrative_area_level_1",
            true
          ); // Use short format
          city = extractComponentFromGoogleAddressComponents(
            googlePlacesData.address_components,
            "locality"
          );
          if (!city || city === "") {
            city = state;
          }
          zip = extractComponentFromGoogleAddressComponents(
            googlePlacesData.address_components,
            "postal_code"
          );
          country = extractComponentFromGoogleAddressComponents(
            googlePlacesData.address_components,
            "country",
            true
          ); // Use short format
          address = `${streetNumber} ${streetName}`;
          if (googlePlacesData.types) categories = [...googlePlacesData.types];
        }
        googlePlacesData.opening_hours &&
          (opening_hours = googlePlacesData.opening_hours);
        googlePlacesData.rating && (rating = googlePlacesData.rating);
        googlePlacesData.user_ratings_total &&
          (reviewCount = googlePlacesData.user_ratings_total);
      }
    }
    const thumbnail = googlePlacesData?.thumbnail;

    if (thumbnail) {
      place.thumbnail = thumbnail;
    }

    if (getReviews) {
      reviews = googlePlacesData?.reviews;
    }

    if (address) {
      //update address with fresh google data
      place.location.address = address;
      place.location.city = city;
      place.location.state = state;
      place.location.zip = zip;
      place.location.country = country;
    }

    if (reviewCount) {
      place.popularity.googlePlacesReviewCount = reviewCount;
    }

    await place.save();

    return {
      google: {
        _id: googlePlacesId,
        rating,
        reviewCount,
        reviews,
        opening_hours,
        thumbnail,
        streetNumber,
        streetName,
        city,
        state,
        zip,
        country,
        address,
        categories,
      },
    };
  } catch (error) {
    return { google: null };
  }
}
