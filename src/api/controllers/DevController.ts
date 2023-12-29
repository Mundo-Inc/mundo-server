import async from "async";
import axios from "axios";
import type { NextFunction, Request, Response } from "express";
import { getAuth } from "firebase-admin/auth";
import { StatusCodes } from "http-status-codes";

import ActivitySeen from "../../models/ActivitySeen";
import CheckIn from "../../models/CheckIn";
import Comment from "../../models/Comment";
import Deal from "../../models/Deal";
import Place, { type IPlace } from "../../models/Place";
import PlaceFeature from "../../models/PlaceFeature";
import Reaction from "../../models/Reaction";
import Review from "../../models/Review";
import SystemRecommendation from "../../models/SystemRecommendation";
import User from "../../models/User";
import UserActivity from "../../models/UserActivity";
import UserFeature from "../../models/UserFeature";
import { handleInputErrors } from "../../utilities/errorHandlers";
import { areSimilar } from "../../utilities/stringHelper";
import logger from "../services/logger";

async function fetchOSMTags(lat: number, lon: number, name: string) {
  try {
    const osmData = await axios.get(
      `https://nominatim.openstreetmap.org/search`,
      {
        params: {
          q: name,
          limit: 1,
          format: "json",
          viewbox: [lon - 0.1, lat - 0.1, lon + 0.1, lat + 0.1].join(","),
          bounded: 1,
        },
      }
    );

    // check if data is received successfully
    if (osmData.data && osmData.data.length > 0) {
      // extract the needed data
      const osmPlace = osmData.data[0];
      const osmId = osmPlace.osm_id;
      const osmType = osmPlace.osm_type;

      // further API call to get detailed OSM data using the ID and type
      const osmDetailData = await axios.get(
        `https://api.openstreetmap.org/api/0.6/${osmType}/${osmId}.json`
      );

      // here you would extract the tags from osmDetailData and
      // merge them with your current data

      console.log(osmDetailData.data); // log data for checking
      // returning the tags for further use
      return osmDetailData.data.elements[0].tags;
    }
  } catch (error) {
    console.error(`Error fetching OSM data: ${error}`);
  }
}

export async function findPlaceByNameAndLocation(
  name: string,
  lat: number,
  lon: number,
  radius = 20
) {
  try {
    // Build Overpass QL query
    const query = `
      [out:json];
      (
        node[amenity](around:${radius},${lat},${lon});
        way[amenity](around:${radius},${lat},${lon});
        );
        out body;
        >;
        out skel qt;
        `;
    // relation[amenity](around:${radius},${lat},${lon});

    // Fetch data from Overpass API
    const response = await axios.post(
      "http://overpass-api.de/api/interpreter",
      query, // Send the query directly as plain text
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const res = response.data;

    // Check if there are no results
    if (res.elements.length === 0) {
      return;
    }

    // Check if there is a single result
    if (res.elements.length === 1) {
      const tagName = res.elements[0].tags?.["name"];
      console.log(res.elements[0].tags?.["name"], areSimilar(tagName, name));
      return areSimilar(tagName, name) ? res.elements[0] : undefined;
    }

    // Handle multiple results
    const results = res.elements.filter((e: any) => e.tags?.["name"]);
    return results.find((element: any) => {
      console.log(element.tags["name"], areSimilar(element.tags["name"], name));
      return areSimilar(element.tags["name"], name);
    });
  } catch (error) {
    console.error(`Error fetching data from Overpass API: ${error}`);
    throw error;
  }
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
    const fixDup = req.query.fixDup === "true" ? true : false;
    if (fixDup) {
      const newPlacesCursor = Place.find().cursor();
      console.log("fixing duplicates");
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
          const placeToKeep = similarNamedPlaces.reduce(
            (keep, currentPlace) => {
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
            },
            similarNamedPlaces[0]
          );

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
            await Place.deleteOne({ _id: placeToRemove._id }); //FIXME: NEVER USE THIS DELETEONE METHOD, USE FOR+DELETEONE INSTEAD
          }
        }
      }
    }
    console.log("fixing missing OSM");
    const placesWithoutOSM = Place.find({ amenity: { $exists: false } });
    //Fix missing OSM data:
    for await (const p of placesWithoutOSM) {
      if (!p.amenity || !p.otherSources || !p.otherSources.OSM) {
        try {
          console.log("->" + p.name);
          // Assuming you have some kind of ID or name to search for in the OSM API
          const response = await findPlaceByNameAndLocation(
            p.name,
            p.location.geoLocation.coordinates[1],
            p.location.geoLocation.coordinates[0]
          );
          // Updating OSM data in place document
          if (!response) {
            // console.log("no response");
          } else if (!response.tags) {
            // console.log("no tags");
          } else {
            const tags = {
              ...(response.tags["air_conditioning"] && {
                air_conditioning: response.tags["air_conditioning"],
              }),
              ...(response.tags["amenity"] && {
                amenity: response.tags["amenity"],
              }),
              ...(response.tags["brand"] && {
                brand: response.tags["brand"],
              }),
              ...(response.tags["contact:instagram"] && {
                instagram: response.tags["contact:instagram"],
              }),
              ...((response.tags["contact:phone"] ||
                response.tags["phone"]) && {
                phone: response.tags["contact:phone"] || response.tags["phone"],
              }),
              ...(response.tags["contact:email"] && {
                email: response.tags["contact:email"],
              }),
              ...((response.tags["contact:website"] ||
                response.tags["website"]) && {
                website:
                  response.tags["contact:website"] || response.tags["website"],
              }),
              ...(response.tags["cuisine"] && {
                cuisine: response.tags["cuisine"],
              }),
              ...(response.tags["delivery"] && {
                delivery: response.tags["delivery"],
              }),
              ...(response.tags["drive_through"] && {
                drive_through: response.tags["drive_through"],
              }),
              ...(response.tags["internet_access"] && {
                internet_access: response.tags["internet_access"],
              }),
              ...(response.tags["opening_hours"] && {
                opening_hours: response.tags["opening_hours"],
              }),
              ...(response.tags["takeaway"] && {
                takeaway: response.tags["takeaway"],
              }),
              ...(response.tags["wheelchair"] && {
                wheelchair: response.tags["wheelchair"],
              }),
            };

            if (response.tags.amenity) {
              p.amenity = response.tags.amenity;
              p.otherSources = {
                ...p.otherSources,
                OSM: {
                  _id: response.id, // Assume that data contains an id field
                  tags: tags,
                  updatedAt: new Date(),
                },
              };
              // Save the updated document
              await p.save();
            }
          }
        } catch (error) {
          console.error("Error fetching OSM data:", error);
          // Handle error appropriately
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

async function updateExistingUsersProgress() {
  // TODO: add this to route
  await User.updateMany(
    { progress: { $exists: false } },
    {
      $set: {
        "progress.xp": 0,
        "progress.level": 1,
        "progress.achievements": [],
      },
    }
  );
  console.log("All users updated!");
}

export async function engagements(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    console.log("Populating engagements");
    const userActivities = await UserActivity.find();
    for (const activity of userActivities) {
      const reactionsCount = await Reaction.countDocuments({
        target: activity._id,
      });
      const commentsCount = await Comment.countDocuments({
        userActivity: activity._id,
      });
      const viewsCount = await ActivitySeen.countDocuments({
        activityId: activity._id,
      });
      activity.hasMedia = false;
      await activity.save();
      if (activity.resourceType === "Review") {
        const relatedReview = await Review.findById(activity.resourceId);
        if (
          relatedReview &&
          ((relatedReview.images && relatedReview.images.length > 0) ||
            (relatedReview.videos && relatedReview.videos.length > 0))
        ) {
          activity.hasMedia = true;
          await activity.save();
        }
      }
      await activity.updateOne({
        engagements: {
          reactions: reactionsCount,
          comments: commentsCount,
          views: viewsCount,
        },
      });
      // console.log(activity._id);
    }
    console.log("Populating engagements finished successfully ✅");
    return res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (error) {
    console.error(error);
  }
}

const categories: string[] = ["restaurant", "bar", "cafe"];

export async function importAllUsersToFirebase(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const users = await User.find(
      { source: { $exists: false } },
      "_id email password"
    ); // Corrected the projection syntax

    const usersArray = users.map((user) => {
      return {
        uid: user._id.toString(),
        email: user.email.address,
        passwordHash: Buffer.from(user.password),
      };
    });
    getAuth()
      .importUsers(usersArray, {
        hash: {
          algorithm: "BCRYPT",
        },
      })
      .then((results: any) => {
        results.errors.forEach((indexedError: any) => {
          console.log(`Error importing user ${indexedError.index}`);
          console.log(indexedError);
        });
      })
      .catch((error: any) => {
        console.log("Error importing users :", error);
      });

    res.status(200).send("All users imported successfully");
  } catch (error: any) {
    console.error("Error during user import:", error);
    res.status(500).send("Error importing users");
  }
}

export async function addPlaceActivities(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    logger.info("Starting to adjust activities per place.");

    // Get a cursor for all places
    const cursor = Place.find({ activities: { $exists: false } }).cursor();

    // Get the total count of places for logging progress
    const totalPlaceCount = await Place.countDocuments({
      activities: { $exists: false },
    });

    // Create a counter to keep track of progress
    let processedCount = 0;

    // Use eachSeries to process each place one by one
    async.eachSeries(
      cursor,
      async (place: IPlace) => {
        const checkinCount = await CheckIn.countDocuments({ place: place._id });
        const reviewCount = await Review.countDocuments({
          source: { $nin: ["yelp", "google"] },
          place: place._id,
        });

        place.activities = { reviewCount, checkinCount };
        await place.save(); // Ensure you await the save operation

        processedCount++;
        logger.verbose(`Processed place ${processedCount}/${totalPlaceCount}`);
      },
      (err: any) => {
        if (err) {
          logger.error(
            "Something happened during initializing activities count per place!",
            { error: err }
          );
          next(err);
        } else {
          logger.info("Finished adjusting activities per place.");
          res.json({
            success: true,
            message: "Activities updated successfully.",
          });
        }
      }
    );
  } catch (error) {
    logger.error(
      "Something happened during initializing activities count per place!",
      { error }
    );
    next(error);
  }
}
