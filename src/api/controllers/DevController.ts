import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";
var levenshtein = require("fast-levenshtein");
import Place, { type IPlace } from "../../models/Place";
import Review from "../../models/Review";
import { handleInputErrors } from "../../utilities/errorHandlers";
import CheckIn from "../../models/CheckIn";
import { stateMapping } from "../services/place.service";
import Deal from "../../models/Deal";
import PlaceFeature from "../../models/PlaceFeature";
import SystemRecommendation from "../../models/SystemRecommendation";
import User from "../../models/User";
import UserFeature from "../../models/UserFeature";

export async function devTests(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { action } = req.params;

    if (action === "processReviews") {
      const places = await Place.find({});
      let i = 0;
      for (const place of places) {
        try {
          await place.processReviews();
        } catch (err) {
          console.error(place._id);
        }
        i++;
        console.log(i);
      }

      res.sendStatus(StatusCodes.NO_CONTENT);
    } else if (action === "removeDuplicates") {
      // find duplicated places
      const places = await Place.aggregate([
        {
          $group: {
            _id: "$otherSources.googlePlaces._id",
            count: { $sum: 1 },
            ids: { $push: "$_id" },
          },
        },
        {
          $match: {
            $and: [
              {
                count: {
                  $gt: 1,
                },
              },
              {
                _id: {
                  $ne: "",
                },
              },
            ],
          },
        },
        {
          $sort: {
            count: -1,
          },
        },
      ]);

      let deleted = {
        places: 0,
        reviews: 0,
        checkIns: 0,
      };

      for (const place of places) {
        let keepId = null;
        let mostReviewCount = null;
        for (const id of place.ids) {
          const reviewsCount = await Review.countDocuments({ place: id });

          if (keepId === null) {
            mostReviewCount = reviewsCount;
            keepId = id;
          } else {
            if (mostReviewCount! < reviewsCount) {
              await Place.findByIdAndDelete(keepId);
              await Review.deleteMany({ place: keepId });
              await CheckIn.deleteMany({ place: keepId });

              mostReviewCount = reviewsCount;
              keepId = id;
            } else {
              // delete
              await Place.findByIdAndDelete(id);
              await Review.deleteMany({ place: id });
              await CheckIn.deleteMany({ place: id });
            }
          }
        }
      }
      res.status(StatusCodes.OK).json(deleted);
    }
  } catch (err) {
    next(err);
  }
}

export async function fixPlaces(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    let places = await Place.find();
    for (const pp of places) {
      //fixing State codes + country codes TODO: Fix for all other states and countries
      let p = pp as IPlace;
      console.log("Fixing state/country code for " + p._id);
      if (p.location.country === "United States") p.location.country = "US";
      if (stateMapping[p.location.state.toLowerCase()]) {
        p.location.state = stateMapping[p.location.state.toLowerCase()];
      }
      await p.save();
    }

    let newPlaces = await Place.find();
    for (const pp of newPlaces) {
      let p = pp as IPlace;
      //removing duplicates
      const nearbyDuplicates = await Place.find({
        "location.geoLocation": {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: p.location.geoLocation.coordinates,
            },
            $maxDistance: 50,
          },
        },
      });

      // Filter by name similarity if required, using your levenshtein method or similar
      const similarNamedPlaces = nearbyDuplicates.filter(
        (nearbyPlace) => levenshtein.get(p.name, nearbyPlace.name) <= 2
      );

      if (similarNamedPlaces.length <= 1) {
        continue;
      } else {
        const placeToKeep = similarNamedPlaces[0];
        const placesToRemove = similarNamedPlaces.filter(
          (p) => p._id !== placeToKeep._id
        );
        for (const placeToRemove of placesToRemove) {
          await CheckIn.updateMany(
            { place: placeToRemove._id },
            {
              place: placeToKeep._id,
            }
          );
          await Deal.updateMany(
            { place: placeToRemove._id },
            {
              place: placeToKeep._id,
            }
          );
          await PlaceFeature.updateMany(
            { place: placeToRemove._id },
            {
              place: placeToKeep._id,
            }
          );
          await Review.updateMany(
            { place: placeToRemove._id },
            {
              place: placeToKeep._id,
            }
          );
          await SystemRecommendation.updateMany(
            { placeId: placeToRemove._id },
            {
              placeId: placeToKeep._id,
            }
          );
          await User.updateMany(
            { latestPlace: placeToRemove._id },
            {
              latestPlace: placeToKeep._id,
            }
          );
          await UserFeature.updateMany(
            { interactedPlaces: { $in: [placeToRemove._id] } },
            { $pull: { interactedPlaces: placeToRemove._id } }
          );
        }

        for (const placeToRemove of placesToRemove) {
          await Place.deleteOne({ _id: placeToRemove._id });
        }
      }
    }
    console.log("Fixing Finished");
    res.status(StatusCodes.OK).json({
      success: true,
      data: {},
    });
  } catch (err) {
    next(err);
  }
}


const categories: string[] = ["restaurant", "bar", "cafe"];
