import axios from "axios";
import type { NextFunction, Request, Response } from "express";
import { param, query, type ValidationChain } from "express-validator";
import { type File } from "formidable";
import { readFileSync, unlinkSync } from "fs";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import Place, { type IPlace } from "../../models/Place";
import Queue from "../../models/Queue";
import { dStrings, dynamicMessage } from "../../strings";
import type { IGPNearbySearch } from "../../types/googleplaces.interface";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { bucketName, parseForm, region, s3 } from "../../utilities/storage";
import { placeEarning } from "../services/earning.service";
import { addCreatePlaceXP } from "../services/ranking.service";
import { addNewPlaceActivity } from "../services/user.activity.service";
import validate from "./validators";
var levenshtein = require("fast-levenshtein");
var country = require("countrystatesjs");
var iso3311a2 = require("iso-3166-1-alpha-2");

import {
  findFoursquareId,
  findTripAdvisorId,
  findYelpId,
  getFoursquareRating,
  getTripAdvisorRating,
  getYelpData,
} from "../services/provider.service";
import { stateMapping } from "../services/place.service";
import { publicReadUserProjectionAG } from "../dto/user/read-user-public.dto";

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

    const { id: authId } = req.user!;

    const { fields, files } = await parseForm(req);

    const placeInfo = {
      name: fields.name![0],
      location: JSON.parse(fields.location![0]),
      description: fields.description?.[0],
      priceRange: fields.priceRange?.[0] ? parseInt(fields.priceRange[0]) : 0,
      categories: fields.categories?.[0]
        ? fields.categories[0].split(",")
        : undefined,
    } as IPlace;

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
      addedBy: authId,
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
    try {
      await placeEarning(authId, place);
      const _act = await addNewPlaceActivity(authId, place._id);
      if (_act) await addCreatePlaceXP(authId);
    } catch (e) {
      console.log(`Something happened during create place: ${e}`);
    }
    return res.status(StatusCodes.CREATED).json({ success: true, data: place });
  } catch (err) {
    next(err);
  }
}

export interface Location {
  geoLocation: {
    type: string;
    coordinates: number[];
  };
  address: string;
  city: string;
  state: string;
  country: string;
  zip: string;
}

export interface Scores {
  overall: number;
  drinkQuality: number;
  foodQuality: number;
  atmosphere: number;
  service: number;
  value: number;
  phantom: number;
}

const categories: string[] = [
  "restaurant",
  "bar",
  "cafe",
  "bakery",
  "meal_delivery",
  "meal_takeaway",
];

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
  query("category").optional().isIn(categories),
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

    const { lat, lng, q, images, order, radius, category } = req.query;
    const sort = req.query.sort || "distance";
    const limit = Number(req.query.limit) || 50;
    const page = Number(req.query.page) || 1;
    const skip = (page - 1) * limit;
    const maxPrice = Number(req.query.maxPrice);
    const minScore = Math.min(Number(req.query.minScore), 4) || 0;
    const matchPipeline: any = [];
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
    if (sort === "score" || sort === "phantomScore") {
      matchObject["reviewCount"] = { $gte: 9 };
    }
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

    let distancePipeline: any = [];
    let sortPipeline: any = [];
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
      if (sort === "distance") {
        const body: {
          [key: string]: any;
        } = {
          near: {
            type: "Point",
            coordinates: [Number(lng) || -73.9804897, Number(lat) || 40.763117],
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

    const lookupPipeline: any = [];
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
                    $project: {
                      _id: 0,
                      username: 1,
                      name: 1,
                      profileImage: 1,
                    },
                  },
                ],
              },
            },
            {
              $project: {
                _id: 0,
                src: 1,
                caption: 1,
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
          reviewCount: 1,
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

    const types = ["restaurant", "cafe", "bar"];

    if (lng && lat && places.length !== limit) {
      let results: IGPNearbySearch["results"] = [];
      await Promise.all(
        types.map(async (type, index) => {
          return axios(
            `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat}%2C${lng}&radius=${
              radius ? (radius === "global" ? 100000 : Number(radius)) : 1000
            }${q ? `&keyword=${q}` : ""}&type=${type}&key=${
              process.env.GOOGLE_PLACES_API_KEY
            }`
          ).then((res) => {
            if (res.data.status === "OK") {
              for (const result of res.data.results) {
                if (!results.find((r) => r.place_id === result.place_id)) {
                  results.push(result);
                }
              }
            }
          });
        })
      );

      if (q && (q as string).length >= 2) {
        if (results.length === 0) {
          await axios(
            `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${q}&inputtype=textquery&locationbias=circle%3A2000%${lat}%2C${lng}&fields=name%2Cplace_id%2Crating&key=${process.env.GOOGLE_PLACES_API_KEY}`
          ).then((res) => {
            if (res.data.status === "OK") {
              results.push(...res.data.candidates);
            }
          });
        }
      }

      for (const result of results) {
        const found = places.find(
          (p) => p.otherSources?.googlePlaces?._id === result.place_id
        );
        if (found) {
          if (found.otherSources?.googlePlaces) {
            await Place.updateOne(
              { _id: found._id },
              {
                otherSources: {
                  googlePlaces: {
                    rating: result.rating,
                    updatedAt: new Date(),
                  },
                },
              }
            );
          } else {
            await Place.updateOne(
              { _id: found._id },
              {
                otherSources: {
                  googlePlaces: {
                    _id: result.place_id,
                    rating: result.rating,
                    updatedAt: new Date(),
                  },
                },
              }
            );
          }
        } else {
          // search db for place
          const found = await Place.findOne({
            "otherSources.googlePlaces._id": result.place_id,
          });
          if (found) {
            if (found.name !== result.name) {
              found.otherNames.push(found.name);
              found.name = result.name;
            }
            found.otherSources.googlePlaces.rating = result.rating;
            // found.otherSources.googlePlaces.updatedAt = new Date();
            found.save();
            continue;
          }

          try {
            const queue = await Queue.create({
              googlePlaceId: result.place_id,
              type: "new",
            });
            await queue.process();
          } catch (e: any) {
            continue;
          }
        }
      }
    }

    places = await Place.aggregate([
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

    if (response[0].reviewCount < 4) {
      delete response[0].scores.phantom;
    }

    res.status(StatusCodes.OK).json({
      success: true,
      data: response[0],
    });
  } catch (err) {
    next(err);
  }
}

export const getThirdPartyRatingValidation: ValidationChain[] = [
  param("id").isMongoId().withMessage("Invalid place id"),
  param("provider")
    .isIn(["googlePlaces", "tripAdvisor", "yelp", "foursquare", "phantomphood"])
    .withMessage("Invalid Third Party Provider"),
];

export async function getThirdPartyRating(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const authId = req.user?.id;
    const { id, provider } = req.params;
    let place = await Place.findById(id);

    let rating = -1;
    let reviewCount = 0;
    switch (provider) {
      case "yelp":
        const yelpId = place.otherSources?.yelp?._id;
        if (typeof yelpId === "string" && yelpId !== "") {
          const yelpData = await getYelpData(yelpId);
          rating = yelpData.rating;
          reviewCount = yelpData.reviewCount;
        } else {
          // Getting the yelpId
          const yelpId = await findYelpId(place);
          // Storing the yelpId
          place.otherSources.yelp = { _id: yelpId };
          await place.save();
          // Returning the yelpRating
          const yelpData = await getYelpData(yelpId);
          rating = yelpData.rating;
          reviewCount = yelpData.reviewCount;
        }
        break;
      case "tripAdvisor":
        const tripAdvisorId = place.otherSources?.tripAdvisor?._id;
        if (typeof tripAdvisorId === "string" && tripAdvisorId !== "") {
          rating = await getTripAdvisorRating(tripAdvisorId);
        } else {
          // Getting the tripAdvisorId
          const tripAdvisorId = await findTripAdvisorId(place);
          // Storing the tripAdvisorId
          place.otherSources.tripAdvisor = { _id: tripAdvisorId };
          await place.save();
          // Returning the tripAdvisorRating
          rating = await getTripAdvisorRating(tripAdvisorId);
        }
        break;
      case "foursquare":
        const foursquareId = place.otherSources?.foursquare?._id;
        if (typeof foursquareId === "string" && foursquareId !== "") {
          rating = await getFoursquareRating(foursquareId);
        } else {
          // Getting the id
          const foursquareId = await findFoursquareId(place);
          // Storing the id
          place.otherSources.foursquare = { _id: foursquareId };
          await place.save();
          // Returning the rating
          rating = await getFoursquareRating(foursquareId);
        }
        break;
      default:
        break;
    }
    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        rating,
        reviewCount,
      },
    });
  } catch (err) {
    next(err);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function importPlaces(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const places = require("../data/osm_places_2.json");

    for (const p of places) {
      if (!p.tags) continue;
      const id = p.id;
      const lat = p.lat;
      const lon = p.lon;
      const name = p.tags["name"];
      const tags = {
        ...(p.tags["air_conditioning"] && {
          air_conditioning: p.tags["air_conditioning"],
        }),
        ...(p.tags["amenity"] && { amenity: p.tags["amenity"] }),
        ...(p.tags["brand"] && { brand: p.tags["brand"] }),
        ...(p.tags["contact:instagram"] && {
          instagram: p.tags["contact:instagram"],
        }),
        ...((p.tags["contact:phone"] || p.tags["phone"]) && {
          phone: p.tags["contact:phone"] || p.tags["phone"],
        }),
        ...(p.tags["contact:email"] && { email: p.tags["contact:email"] }),
        ...((p.tags["contact:website"] || p.tags["website"]) && {
          website: p.tags["contact:website"] || p.tags["website"],
        }),
        ...(p.tags["cuisine"] && { cuisine: p.tags["cuisine"] }),
        ...(p.tags["delivery"] && { delivery: p.tags["delivery"] }),
        ...(p.tags["drive_through"] && {
          drive_through: p.tags["drive_through"],
        }),
        ...(p.tags["internet_access"] && {
          internet_access: p.tags["internet_access"],
        }),
        ...(p.tags["opening_hours"] && {
          opening_hours: p.tags["opening_hours"],
        }),
        ...(p.tags["takeaway"] && { takeaway: p.tags["takeaway"] }),
        ...(p.tags["wheelchair"] && { wheelchair: p.tags["wheelchair"] }),
      };

      if (!name || !lat || !lon) continue;

      const nearbyPlaces = await Place.find({
        "location.geoLocation": {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: [lon, lat],
            },
            $maxDistance: 50, // in meters
          },
        },
      });

      let placeExists = false;

      for (const place of nearbyPlaces) {
        const distance = levenshtein.get(name, place.name);

        if (distance <= 2) {
          // found -> update
          place.otherSources.OSM = {
            _id: id,
            tags: tags,
          };
          place.amenity = p.tags["amenity"];
          if (p.tags["cuisine"]) place.cuisine = p.tags["cuisine"].split(";");
          await place.save();
          placeExists = true;
          console.log(place.name);
          break; // Break the loop if found
        }
      }

      if (!placeExists && p.tags.name && p.tags.cuisine) {
        // not found -> insert
        // Check if the amenity has a name at least and is valid
        await sleep(25);
        const MAX_RETRIES = 12; // Adjust as needed
        let retries = 0;

        while (retries < MAX_RETRIES) {
          try {
            const geoResponse = await axios(
              `https://geocode.maps.co/reverse?lat=${lat}&lon=${lon}`
            );
            const addressData = geoResponse.data.address;
            if (p.tags.name && p.tags.cuisine) {
              console.log(p.tags.name);
              if (
                country.state(
                  iso3311a2.getCode(addressData.country),
                  addressData.state
                )
              ) {
                let location = {
                  geoLocation: {
                    type: "Point",
                    coordinates: [Number(lon), Number(lat)],
                  },
                  address: addressData.road,
                  city:
                    addressData.city ||
                    addressData.town ||
                    addressData.suburb ||
                    addressData.village ||
                    addressData.county,
                  country: iso3311a2.getCode(addressData.country),
                  state: country.state(
                    iso3311a2.getCode(addressData.country),
                    addressData.state
                  ).abbreviation,
                  house_number: addressData.house_number,
                  zip: addressData.postcode,
                };
                if (!location.city) break;
                let newPlace = new Place({
                  name: name,
                  location: location,
                });
                newPlace.otherSources.OSM = {
                  _id: id,
                  tags: tags,
                };
                newPlace.amenity = p.tags["amenity"];
                if (p.tags["cuisine"])
                  newPlace.cuisine = p.tags["cuisine"].split(";");
                await newPlace.save();
              }
            }
            break;
          } catch (error: any) {
            retries++;
            console.error(
              "Error fetching geolocation data, attempt:",
              retries,
              error.message
            );

            if (retries >= MAX_RETRIES) {
              console.error("Max retries reached, moving to the next place.");
              break;
            }

            await sleep(3000); // Sleep for 60 seconds before retrying
          }
        }
      }
    }

    res.status(StatusCodes.OK).json({
      success: true,
      data: {},
    });
  } catch (err) {
    next(err);
  }
}

function getDistance(cluster1: any, cluster2: any) {
  const latDiff = cluster1.latitude - cluster2.latitude;
  const lngDiff = cluster1.longitude - cluster2.longitude;
  return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
}

function mergeClusters(clusters: any) {
  while (clusters.length > 8) {
    let minDistance = Infinity;
    let pair = [0, 1];

    // Find the closest pair of clusters
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const distance = getDistance(clusters[i], clusters[j]);
        if (distance < minDistance) {
          minDistance = distance;
          pair = [i, j];
        }
      }
    }

    // Merge clusters
    const [a, b] = pair;
    const totalCount = clusters[a].count + clusters[b].count;
    clusters[a].latitude =
      (clusters[a].latitude * clusters[a].count +
        clusters[b].latitude * clusters[b].count) /
      totalCount;
    clusters[a].longitude =
      (clusters[a].longitude * clusters[a].count +
        clusters[b].longitude * clusters[b].count) /
      totalCount;
    clusters[a].count = totalCount;
    clusters[a].places = (clusters[a].places || []).concat(
      clusters[b].places || []
    );

    // Remove the merged cluster
    clusters.splice(b, 1);
  }

  return clusters;
}

async function getClusteredPlaces(
  northEast: { lat: number; lng: number },
  southWest: { lat: number; lng: number },
  zoom: number
) {
  const PRECISION = Math.max(1, Math.pow(2, 18 - zoom));
  const TOP_PLACES_LIMIT = 40;
  const THRESHOLD = 30;
  const ZOOM_THRESHOLD = 12;

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
      },
    },
    {
      $limit: TOP_PLACES_LIMIT,
    },
    {
      $project: {
        name: 1,
        description: 1,
        longitude: { $arrayElemAt: ["$location.geoLocation.coordinates", 0] },
        latitude: { $arrayElemAt: ["$location.geoLocation.coordinates", 1] },
        overallScore: "$scores.overall",
        phantomScore: "$scores.phantom", // Projecting phantom score
      },
    },
  ];

  const clustersPipeline = [
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
      $group: {
        _id: {
          lat: {
            $floor: {
              $multiply: [
                { $arrayElemAt: ["$location.geoLocation.coordinates", 1] },
                PRECISION,
              ],
            },
          },
          lng: {
            $floor: {
              $multiply: [
                { $arrayElemAt: ["$location.geoLocation.coordinates", 0] },
                PRECISION,
              ],
            },
          },
        },
        count: { $sum: 1 },
        longitude: {
          $avg: { $arrayElemAt: ["$location.geoLocation.coordinates", 0] },
        },
        latitude: {
          $avg: { $arrayElemAt: ["$location.geoLocation.coordinates", 1] },
        },
        topPlaces: {
          $push: {
            _id: "$_id",
            name: "$name",
            description: "$description",
            overallScore: "$scores.overall",
          },
        },
      },
    },
    {
      $project: {
        count: 1,
        longitude: 1,
        latitude: 1,
        places: {
          $cond: {
            if: { $lt: ["$count", THRESHOLD] },
            then: { $slice: ["$topPlaces", THRESHOLD] },
            else: [],
          },
        },
      },
    },
  ];

  const topPlaces = await mongoose.models.Place.aggregate(topPlacesPipeline);
  let clusters = [];
  if (zoom > ZOOM_THRESHOLD) {
    clusters = await mongoose.models.Place.aggregate(clustersPipeline);
    clusters = mergeClusters(clusters);
  }

  return {
    places: topPlaces,
    clusters: clusters.map((cluster: any) => ({
      count: cluster.count,
      longitude: cluster.longitude,
      latitude: cluster.latitude,
    })),
  };
}

export const getPlacesWithinBoundariesValidation: ValidationChain[] = [
  query("zoom").optional().isNumeric().withMessage("Invalid zoom"),

  query("northEastLat")
    .isNumeric()
    .withMessage("Invalid northEastLat")
    .bail() // proceed to next validator only if the previous one passes
    .custom((value) => value >= -90 && value <= 90)
    .withMessage("northEastLat should be between -90 and 90"),

  query("northEastLng")
    .isNumeric()
    .withMessage("Invalid northEastLng")
    .bail()
    .custom((value) => value >= -180 && value <= 180)
    .withMessage("northEastLng should be between -180 and 180"),

  query("southWestLat")
    .isNumeric()
    .withMessage("Invalid southWestLat")
    .bail()
    .custom((value) => value >= -90 && value <= 90)
    .withMessage("southWestLat should be between -90 and 90"),

  query("southWestLng")
    .isNumeric()
    .withMessage("Invalid southWestLng")
    .bail()
    .custom((value) => value >= -180 && value <= 180)
    .withMessage("southWestLng should be between -180 and 180"),
];

export async function getPlacesWithinBoundaries(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const { northEastLat, northEastLng, southWestLat, southWestLng, zoom } =
      req.query;
    const northEast = {
      lat: Number(northEastLat),
      lng: Number(northEastLng),
    };
    const southWest = {
      lat: Number(southWestLat),
      lng: Number(southWestLng),
    };

    const result = await getClusteredPlaces(northEast, southWest, Number(zoom));

    res.status(StatusCodes.OK).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}
