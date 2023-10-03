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

function cleanAndSort(str: string) {
  return str.split(" ").sort().join(" ").toLowerCase();
}

function areSimilar(str1: string, str2: string) {
  const cleanedStr1 = cleanAndSort(str1);
  const cleanedStr2 = cleanAndSort(str2);

  return (
    cleanedStr1 === cleanedStr2 ||
    levenshtein.get(cleanedStr1, cleanedStr2) <= 2 ||
    cleanedStr1.includes(cleanedStr2) ||
    cleanedStr2.includes(cleanedStr1)
  );
}

export async function fixPlaces(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    let dupCount = 0;
    handleInputErrors(req);
    // Fixing country codes:
    /*
    const placesCursor = Place.find().cursor();
    for await (const p of placesCursor) {
      console.log("Fixing state/country code for " + p._id);
      if (p.location.country === "United States") p.location.country = "US";
      if (stateMapping[p.location.state.toLowerCase()]) {
        p.location.state = stateMapping[p.location.state.toLowerCase()];
      }
      await p.save();
    }
    */
    const newPlacesCursor = Place.find().cursor();
    for await (const p of newPlacesCursor) {
      //removing duplicates
      const nearbyDuplicates = await Place.find({
        "location.geoLocation": {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: p.location.geoLocation.coordinates,
            },
            $maxDistance: 30,
          },
        },
      });
      const similarNamedPlaces = nearbyDuplicates.filter((nearbyPlace) =>
        areSimilar(nearbyPlace.name, p.name)
      );
      if (similarNamedPlaces.length <= 1) {
        continue;
      } else {
        const placeToKeep = similarNamedPlaces.reduce((keep, currentPlace) => {
          // Keep the place if it has 'scores.phantom'
          if (currentPlace.scores && currentPlace.scores.phantom) {
            return currentPlace;
          }
          // If 'keep' has 'scores.phantom', maintain it as is
          if (keep.scores && keep.scores.phantom) {
            return keep;
          }
          // Keep the place with a longer name
          if (currentPlace.name.length > keep.name.length) {
            return currentPlace;
          }
          // If all conditions fail, maintain 'keep' as is
          return keep;
        }, similarNamedPlaces[0]);

        const placesToRemove = similarNamedPlaces.filter(
          (place) => String(place._id) !== String(placeToKeep._id)
        );
        for (const placeToRemove of placesToRemove) {
          // Update or delete other documents referring to `placeToRemove` as needed
          await updateReferences(placeToRemove, placeToKeep);
        }
        console.log("--- " + placeToKeep.name);
        for (const placeToRemove of placesToRemove) {
          console.log("DUP " + placeToRemove.name);
          dupCount++;
          await Place.deleteOne({ _id: placeToRemove._id });
        }
      }
    }

    console.log("Fixing Finished (" + dupCount + "Duplicates removed)");
    res.status(StatusCodes.OK).json({
      success: true,
      data: {},
    });
  } catch (err) {
    next(err);
  }
}

async function updateReferences(placeToRemove: IPlace, placeToKeep: IPlace) {
  await CheckIn.updateMany(
    { place: placeToRemove._id },
    { place: placeToKeep._id }
  );
  await Deal.updateMany(
    { place: placeToRemove._id },
    { place: placeToKeep._id }
  );
  await PlaceFeature.updateMany(
    { place: placeToRemove._id },
    { place: placeToKeep._id }
  );
  await Review.updateMany(
    { place: placeToRemove._id },
    { place: placeToKeep._id }
  );
  await SystemRecommendation.updateMany(
    { placeId: placeToRemove._id },
    { placeId: placeToKeep._id }
  );
  await User.updateMany(
    { latestPlace: placeToRemove._id },
    { latestPlace: placeToKeep._id }
  );
  await UserFeature.updateMany(
    { interactedPlaces: { $in: [placeToRemove._id] } },
    { $pull: { interactedPlaces: placeToRemove._id } }
  );
}

const categories: string[] = ["restaurant", "bar", "cafe"];
