import { PutObjectCommand } from "@aws-sdk/client-s3";
import type { NextFunction, Request, Response } from "express";
import { query, type ValidationChain } from "express-validator";
import { type File } from "formidable";
import { readFileSync, unlinkSync } from "fs";
import { StatusCodes } from "http-status-codes";
import mongoose, { type PipelineStage } from "mongoose";

import Place, { type IPlace } from "../../models/Place";
import { dStrings, dynamicMessage } from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { getPaginationFromQuery } from "../../utilities/pagination";
import { bucketName, parseForm, region, s3 } from "../../utilities/storage";
import { areStrictlySimilar } from "../../utilities/stringHelper";
import UserProjection from "../dto/user";
import { getDetailedPlace } from "./SinglePlaceController";
import validate from "./validators";

export const createPlaceValidation: ValidationChain[] = [
  // validate.name(body("name")),
  // validate.place.description(body("description").optional()),
  // validate.place.priceRange(body("priceRange").optional()),
  // validate.place.categories(body("categories").optional()),
];
export async function createPlace(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // NO PARSER
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const { fields, files } = await parseForm(req);

    const placeInfo = {
      name: fields.name![0],
      location: JSON.parse(fields.location![0]),
      description: fields.description?.[0] || "",
      priceRange: fields.priceRange?.[0] ? parseInt(fields.priceRange[0]) : 0,
      categories: fields.categories?.[0] ? fields.categories[0].split(",") : [],
    };

    let place = await Place.findOne({
      name: placeInfo.name,
      "location.geoLocation.coordinates.0": {
        $gte: placeInfo.location.geoLocation.coordinates[0] - 0.0001,
        $lte: placeInfo.location.geoLocation.coordinates[0] + 0.0001,
      },
      "location.geoLocation.coordinates.1": {
        $gte: placeInfo.location.geoLocation.coordinates[1] - 0.0001,
        $lte: placeInfo.location.geoLocation.coordinates[1] + 0.0001,
      },
    });
    if (place) {
      throw createError(
        dynamicMessage(dStrings.alreadyExists, "Place"),
        StatusCodes.CONFLICT
      );
    }

    const body: {
      [key: string]: any;
    } = {
      name: placeInfo.name,
      location: placeInfo.location,
      scores: {
        overall: null,
      },
      addedBy: authUser._id,
    };
    if (placeInfo.description) {
      body.description = placeInfo.description;
    }
    if (placeInfo.priceRange) {
      body.priceRange = placeInfo.priceRange;
    }
    if (placeInfo.categories && placeInfo.categories.length > 0) {
      body.categories = placeInfo.categories;
    }

    place = new Place(body);

    if (files.image && files.image.length > 0) {
      const { filepath } = files.image[0] as File;
      let fileBuffer = readFileSync(filepath);
      const key = `${
        process.env.NODE_ENV === "production" ? "places" : "devplaces"
      }/${place._id}/thumbnail.jpg`;
      await s3.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          Body: fileBuffer,
          ContentType: "image/jpeg",
        })
      );
      place.thumbnail = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;

      unlinkSync(filepath);
    }
    await place.save();
    return res.status(StatusCodes.CREATED).json({ success: true, data: place });
  } catch (err) {
    next(err);
  }
}

export const getPlacesValidation: ValidationChain[] = [
  validate.lat(query("lat").optional()),
  validate.lng(query("lng").optional()),
  validate.q(query("q").optional()),
  validate.limit(query("limit").optional(), 1, 50),
  validate.page(query("page").optional(), 50),
  query("images").optional().isInt({ min: 0, max: 5 }),
  query("order").optional().isIn(["asc", "desc"]),
  query("radius")
    .optional()
    .custom((value) => {
      if (typeof value === "string" && value === "global") {
        return true;
      }
      if (typeof Number(value) === "number") {
        return true;
      }
      throw new Error("Invalid radius");
    }),
  query("sort")
    .optional()
    .isIn(["distance", "score", "phantomScore", "priceRange"]),
  query("maxPrice").optional().isInt({ min: 0, max: 4 }),
  query("minScore").optional().isInt({ min: 0, max: 4 }),
];
export async function getPlaces(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { lat, lng, q, images, order, radius } = req.query;
    const sort = req.query.sort
      ? req.query.sort === "distance"
        ? lat && lng
          ? "distance"
          : "score"
        : req.query.sort
      : lat && lng
      ? "distance"
      : "score";

    const { limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 10,
      maxLimit: 50,
    });

    const maxPrice = Number(req.query.maxPrice);
    const minScore = Math.min(Number(req.query.minScore), 4) || 0;
    const matchPipeline: PipelineStage[] = [];
    const matchObject: any = {};
    if (q) {
      matchObject["name"] = { $regex: q || "", $options: "i" };
    }
    if (maxPrice) {
      matchObject["priceRange"] = { $exists: true, $lte: maxPrice };
    }
    if (minScore) {
      matchObject["scores.overall"] = { $gte: minScore };
    }
    // if (sort === "score" || sort === "phantomScore") {
    //   matchObject["reviewCount"] = { $gte: 9 };
    // }
    if (sort === "priceRange") {
      if (!matchObject["priceRange"]) {
        matchObject["priceRange"] = { $exists: true };
      }
    }

    if (Object.keys(matchObject).length > 0) {
      matchPipeline.push({
        $match: matchObject,
      });
    }

    let distancePipeline: PipelineStage[] = [];
    let sortPipeline: PipelineStage[] = [];
    const sortItems: {
      [key: string]: string;
      score: string;
      phantomScore: string;
      distance: string;
      priceRange: string;
    } = {
      score: "scores.overall",
      phantomScore: "scores.phantom",
      distance: "dist.calculated",
      priceRange: "priceRange",
    };
    if (sort && Object.keys(sortItems).includes(sort as string)) {
      if (sort === "distance" && lat && lng) {
        const body: PipelineStage.GeoNear["$geoNear"] = {
          near: {
            type: "Point",
            coordinates: [Number(lng), Number(lat)],
          },
          distanceField: "dist.calculated",
          spherical: true,
        };
        if (!radius || radius !== "global") {
          body.maxDistance = radius ? Number(radius) : 1000;
        }
        distancePipeline.push({
          $geoNear: body,
        });
        if (order === "dsc") {
          sortPipeline.push({
            $sort: {
              "dist.calculated": -1,
            },
          });
        }
      } else {
        sortPipeline.push({
          $sort: {
            [sortItems[sort as string]]: order === "asc" ? 1 : -1,
          },
        });
      }
    }

    const lookupPipeline: PipelineStage[] = [];
    if (images && parseInt(images as string) > 0) {
      lookupPipeline.push({
        $lookup: {
          from: "media",
          localField: "_id",
          foreignField: "place",
          as: "images",
          pipeline: [
            {
              $limit: parseInt(images as string),
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
                _id: 0,
                src: 1,
                caption: 1,
                type: 1,
                user: {
                  $arrayElemAt: ["$user", 0],
                },
              },
            },
          ],
        },
      });
    }

    const projectPipeline: any = [
      {
        $project: {
          _id: 1,
          name: 1,
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
          thumbnail: 1,
          scores: 1,
          phone: 1,
          website: 1,
          categories: 1,
          priceRange: 1,
          activities: 1,
          images: 1,
        },
      },
    ];

    let places = await Place.aggregate([
      ...distancePipeline,
      ...matchPipeline,
      ...sortPipeline,
      {
        $skip: skip,
      },
      {
        $limit: limit,
      },
      ...lookupPipeline,
      ...projectPipeline,
    ]);

    res.status(StatusCodes.OK).json({ success: true, places: places });
  } catch (err) {
    next(err);
  }
}

async function getClusteredPlaces(
  northEast: { lat: number; lng: number },
  southWest: { lat: number; lng: number }
) {
  const TOP_PLACES_LIMIT = 40;

  // Step 1: Get top 40 relevant places
  const topPlacesPipeline: any = [
    {
      $match: {
        "location.geoLocation": {
          $geoWithin: {
            $geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [southWest.lng, southWest.lat],
                  [northEast.lng, southWest.lat],
                  [northEast.lng, northEast.lat],
                  [southWest.lng, northEast.lat],
                  [southWest.lng, southWest.lat],
                ],
              ],
            },
          },
        },
      },
    },
    {
      $sort: {
        "scores.phantom": -1, // sort by phantom first
        "scores.overall": -1, // then by overall score
        "popularity.googlePlacesReviewCount": -1, // then by google review count
        "popularity.yelpReviewCount": -1, // then by yelp review count
      },
    },
    {
      $limit: TOP_PLACES_LIMIT,
    },
    {
      $project: {
        name: 1,
        amenity: 1,
        longitude: { $arrayElemAt: ["$location.geoLocation.coordinates", 0] },
        latitude: { $arrayElemAt: ["$location.geoLocation.coordinates", 1] },
        overallScore: "$scores.overall",
        phantomScore: "$scores.phantom", // Projecting phantom score
      },
    },
  ];

  const topPlaces = await mongoose.models.Place.aggregate(topPlacesPipeline);

  return {
    places: topPlaces,
    clusters: [],
  };
}
export const getPlacesWithinBoundariesValidation: ValidationChain[] = [
  validate.lat(query("northEastLat")),
  validate.lng(query("northEastLng")),
  validate.lat(query("southWestLat")),
  validate.lng(query("southWestLng")),
];
export async function getPlacesWithinBoundaries(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const { northEastLat, northEastLng, southWestLat, southWestLng } =
      req.query;
    const northEast = {
      lat: Number(northEastLat),
      lng: Number(northEastLng),
    };
    const southWest = {
      lat: Number(southWestLat),
      lng: Number(southWestLng),
    };

    const result = await getClusteredPlaces(northEast, southWest);

    res.status(StatusCodes.OK).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export const getPlacesByContextValidation: ValidationChain[] = [
  validate.lat(query("lat")),
  validate.lng(query("lng")),
  query("title").isString().notEmpty().withMessage("title cannot be empty"),
];
export async function getPlacesByContext(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { lat, lng, title } = req.query;
    const latitude = Number(lat);
    const longitude = Number(lng);

    if (typeof title !== "string") {
      throw createError("Invalid title", StatusCodes.BAD_REQUEST);
    }

    // get the place or if it doesn't exist create it

    const nearbyPlaces = await Place.find({
      "location.geoLocation": {
        $nearSphere: {
          $geometry: {
            type: "Point",
            coordinates: [longitude, latitude],
          },
          $maxDistance: 30, // in meters
        },
      },
    });

    let matchedPlace: IPlace | null = null;
    let existing: Boolean = false;

    for (const place of nearbyPlaces) {
      if (areStrictlySimilar(title, place.name)) {
        matchedPlace = place;
        existing = true;
        break;
      }
    }

    if (!matchedPlace) {
      matchedPlace = await Place.create({
        name: title,
        location: {
          geoLocation: {
            type: "Point",
            coordinates: [longitude, latitude],
          },
        },
      });
    }

    // combine it with detailed data

    const result = await getDetailedPlace(matchedPlace?._id);

    if (!existing && !result.thirdParty.google?.id) {
      // If the place is new and doesn't exist on Google, delete it
      await Place.deleteOne({ _id: matchedPlace?._id });
      throw createError("Place doesn't exist", StatusCodes.NOT_FOUND);
    } else {
      res.status(StatusCodes.OK).json({
        success: true,
        data: result,
      });
    }
  } catch (err) {
    next(err);
  }
}
