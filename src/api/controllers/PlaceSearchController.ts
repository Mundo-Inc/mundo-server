import axios from "axios";
import type { NextFunction, Request, Response } from "express";
import { query, type ValidationChain } from "express-validator";
import levenshtein from "fast-levenshtein";
import haversine from "haversine-distance";
import { StatusCodes } from "http-status-codes";

import Place, { type IPlace } from "../../models/Place";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import logger from "../services/logger";

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;

const RADIUS = 10000; // In meters, adjust as necessary
const INTEREST_TYPES = [
  "restaurant",
  "bar",
  "bakery",
  "meal_takeaway",
  "cafe",
  "pub",
  "meal_delivery",
  "night_club",
];

interface IGooglePlace {
  place_id: string;
  name: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  types: string[];
}

async function fetchGooglePlaces(query: string, lat: number, lng: number) {
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${RADIUS}&type=${INTEREST_TYPES.join(
    "|"
  )}&keyword=${query}&key=${API_KEY}`;
  const googleResponse = await axios.get(url);
  return googleResponse.data.results || [];
}

function nameSimilarity(name1: string, name2: string) {
  const cleanName1 = name1.toLocaleLowerCase().trim();
  const cleanName2 = name2.toLocaleLowerCase().trim();
  if (
    cleanName2.toLocaleLowerCase().trim().includes(cleanName1) ||
    cleanName1.toLocaleLowerCase().trim().includes(cleanName2)
  ) {
    return 1;
  }
  const distance = levenshtein.get(cleanName1, cleanName2);
  const maxLength = Math.max(cleanName1.length, cleanName2.length);
  return 1 - distance / maxLength;
}

function locationProximity(
  loc1: { latitude: number; longitude: number },
  loc2: { latitude: number; longitude: number }
) {
  const distance = haversine(loc1, loc2);
  if (distance <= 10) return 1;
  return Math.exp(-distance / 50);
}

export const searchPlacesValidation: ValidationChain[] = [
  query("q").isString(),
  query("lat").isNumeric(),
  query("lng").isNumeric(),
];

function amenityMatch(amenity1: string, amenity2: string[]): number {
  if (!amenity1 || amenity2.length === 0) return 0;

  let bestMatchScore = 0;
  for (const type of amenity2) {
    const str1Clean = amenity1.toLowerCase().trim();
    const str2Clean = type.toLowerCase().trim();
    if (str1Clean.includes(str2Clean) || str2Clean.includes(str1Clean)) {
      bestMatchScore = 1; // Found an exact match, so break out of loop
      break;
    }
  }
  return bestMatchScore;
}

async function getOrSavePlace(place: IGooglePlace) {
  let existingPlace = await Place.findOne({
    "otherSources.googlePlaces._id": place.place_id,
  });

  if (!existingPlace) {
    // Fetch all nearby places within a 20-meter radius
    const nearbyPlaces = await Place.find({
      "location.geoLocation": {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [
              place.geometry.location.lng,
              place.geometry.location.lat,
            ],
          },
          $maxDistance: 20,
        },
      },
    });

    let highestSimilarityScore = 0;
    let mostSimilarPlace: IPlace | null = null;

    // Calculate similarity score for each nearby place
    for (const nearbyPlace of nearbyPlaces) {
      const nameSimilarityScore = nameSimilarity(nearbyPlace.name, place.name);
      const locationProximityScore = locationProximity(
        {
          latitude: nearbyPlace.location.geoLocation.coordinates[1],
          longitude: nearbyPlace.location.geoLocation.coordinates[0],
        },
        {
          latitude: place.geometry.location.lat,
          longitude: place.geometry.location.lng,
        }
      );

      const amenityMatchScore = amenityMatch(nearbyPlace.amenity, place.types);
      const similarityScore =
        nameSimilarityScore * 0.5 +
        locationProximityScore * 0.45 +
        amenityMatchScore * 0.05;

      if (similarityScore > highestSimilarityScore) {
        highestSimilarityScore = similarityScore;
        mostSimilarPlace = nearbyPlace;
      }
    }

    if (mostSimilarPlace && highestSimilarityScore >= 0.75) {
      existingPlace = mostSimilarPlace;
      // Update existingPlace with Google's place_id
      //   existingPlace.otherSources.googlePlaces._id = place.place_id;
      //   await existingPlace.save();
    }
  }

  return existingPlace;
}

export async function searchPlaces(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { q, lat, lng } = req.query;

    if (
      typeof q !== "string" ||
      typeof lat !== "string" ||
      typeof lng !== "string"
    ) {
      throw createError("Invalid parameters.", StatusCodes.BAD_REQUEST);
    }

    const googlePlaces: IGooglePlace[] = await fetchGooglePlaces(
      q,
      parseFloat(lat),
      parseFloat(lng)
    );

    let limit = 8;
    // Handle the places
    const places: IPlace[] = [];
    logger.verbose("found " + googlePlaces.length + " places");
    for (const place of googlePlaces) {
      const savedPlace = await getOrSavePlace(place);
      if (savedPlace) {
        places.push(savedPlace);
        if (places.length >= limit) break;
      }
    }

    // Return the places
    res.status(StatusCodes.OK).json({ places });
  } catch (err) {
    next(err);
  }
}
