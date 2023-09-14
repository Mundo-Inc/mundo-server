import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import Place, { type IPlace } from "../../models/Place";
import Review from "../../models/Review";
import { handleInputErrors } from "../../utilities/errorHandlers";
import CheckIn from "../../models/CheckIn";
import { stateMapping } from "../services/place.service";

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
          let p = pp as IPlace;
          console.log("Fixing " + p._id);
          if (p.location.country === "United States") p.location.country = "US";
          if (stateMapping[p.location.state.toLowerCase()]) {
            p.location.state = stateMapping[p.location.state.toLowerCase()];
          }
          await p.save();
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
