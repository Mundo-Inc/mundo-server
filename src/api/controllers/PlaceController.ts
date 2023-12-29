import { PutObjectCommand } from "@aws-sdk/client-s3";
import axios from "axios";
import type { NextFunction, Request, Response } from "express";
import { param, query, type ValidationChain } from "express-validator";
import { type File } from "formidable";
import { readFileSync, unlinkSync } from "fs";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import Place, { type IPlace } from "../../models/Place";
import { dStrings, dynamicMessage } from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { bucketName, parseForm, region, s3 } from "../../utilities/storage";
import { areSimilar, areStrictlySimilar } from "../../utilities/stringHelper";
import { publicReadUserProjection } from "../dto/user/read-user-public.dto";
import {
  findFoursquareId,
  findTripAdvisorId,
  findYelpId,
  getFoursquareRating,
  getTripAdvisorRating,
  getYelpData,
} from "../services/provider.service";
import { getDetailedPlace } from "./SinglePlaceController";
import validate from "./validators";

var levenshtein = require("fast-levenshtein");
var country = require("countrystatesjs");
var iso3311a2 = require("iso-3166-1-alpha-2");

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
      categories: fields.categories?.[0] ? fields.categories[0].split(",") : [],
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
    const sort = req.query.sort
      ? req.query.sort === "distance"
        ? lat && lng
          ? "distance"
          : "score"
        : req.query.sort
      : lat && lng
      ? "distance"
      : "score";
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
      if (sort === "distance" && lat && lng) {
        const body: {
          [key: string]: any;
        } = {
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
                    $lookup: {
                      from: "achievements",
                      localField: "progress.achievements",
                      foreignField: "_id",
                      as: "progress.achievements",
                    },
                  },
                  {
                    $project: publicReadUserProjection,
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

    res.status(StatusCodes.OK).json({ success: true, places: places });
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
    const onlyUpdate = req.query.onlyUpdate === "true" ? true : false;

    const places = require("../data/osm_places_3.json");
    let count = 1;
    for (const p of places) {
      if (!p.tags) continue;
      const id = p.id;
      const lat = p.lat;
      const lon = p.lon;
      const amenity = p.tags["amenity"];
      const name =
        p.tags["name"] ||
        p.tags["name:en"] ||
        p.tags["old_name"] ||
        p.tags["short_name"];
      console.log(name);

      if (count % 20 === 0) {
        console.log(" >" + count + "/" + places.length);
      }

      count++;
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

      if (!name || !lat || !lon) {
        console.log("missing crusial info skipping");
        continue;
      }

      const nearbyPlaces = await Place.find({
        "location.geoLocation": {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: [lon, lat],
            },
            $maxDistance: 30, // in meters
          },
        },
      });

      let placeExists = false;

      for (const place of nearbyPlaces) {
        if (areSimilar(name, place.name)) {
          // found -> update
          place.otherSources.OSM = {
            _id: id,
            tags: tags,
          };
          place.amenity = amenity;
          if (p.tags["cuisine"]) place.cuisine = p.tags["cuisine"].split(";");
          await place.save();
          placeExists = true;
          break; // Break the loop if found
        }
      }

      if (!placeExists && name && amenity && !onlyUpdate) {
        // not found -> insert
        // Check if the amenity has a name at least and is valid
        await sleep(100);
        const MAX_RETRIES = 6; // Adjust as needed
        let retries = 0;

        while (retries < MAX_RETRIES) {
          try {
            console.log("fetching");
            const geoResponse = await axios(
              `https://geocode.maps.co/reverse?lat=${lat}&lon=${lon}`
            );
            const addressData = geoResponse.data.address;
            if (name && amenity) {
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

                if (!location.city) {
                  console.log("no city");
                  break;
                }
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
                console.log("saving");
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

            await sleep(3000); // Sleep for dynamic seconds based on retries
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

export const getPlacesByContextValidation: ValidationChain[] = [
  query("lat").isNumeric().withMessage("Invalid lat"),
  query("lng").isNumeric().withMessage("Invalid lng"),
  query("title").isString().withMessage("Invalid title"),
];

export async function getPlacesByContext(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authId = req.user?.id;

    const { lat, lng, title } = req.query;
    const latitude = Number(lat);
    const longitude = Number(lng);

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

    if (typeof title === "string") {
      for (const place of nearbyPlaces) {
        if (areStrictlySimilar(title, place.name)) {
          matchedPlace = place;
          existing = true;
          break;
        }
      }
    } else {
      throw createError("Invalid title", StatusCodes.BAD_REQUEST);
    }

    if (!matchedPlace) {
      const place = new Place({
        name: title,
        location: {
          geoLocation: {
            type: "Point",
            coordinates: [longitude, latitude],
          },
        },
      });
      matchedPlace = await place.save();
    }

    // combine it with detailed data

    const result = await getDetailedPlace(matchedPlace?._id, authId);

    if (!existing && !result.thirdParty.google?._id) {
      // If the place is new and doesn't exist on Google, delete it
      const place = await Place.findById(matchedPlace?._id);
      await place.deleteOne();
      res.status(StatusCodes.NOT_FOUND).json({
        success: false,
      });
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
