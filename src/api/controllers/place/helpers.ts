import axios from "axios";
import { StatusCodes } from "http-status-codes";
import type { Document, Types } from "mongoose";

import type {
  GooglePlaceDetailsAdvanced,
  GooglePlaceDetailsLocationOnly,
  OpeningHours,
} from "../../../_dataManagers/GoogleDataManager.js";
import {
  GoogleDataManager,
  GooglePlaceFields,
} from "../../../_dataManagers/GoogleDataManager.js";
import logger from "../../../api/services/logger/index.js";
import {
  findYelpId,
  getYelpData,
} from "../../../api/services/provider.service.js";
import Media from "../../../models/Media.js";
import type { IPlace } from "../../../models/Place.js";
import Place from "../../../models/Place.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import type { IYelpPlaceDetails } from "../../../types/yelpPlace.interface.js";
import S3Manager from "../../../utilities/_s3Manager/index.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { filterObjectByConfig } from "../../../utilities/filtering.js";

export async function getDetailedPlace(id: Types.ObjectId) {
  const place = await Place.findById(id).orFail(
    createError(dynamicMessage(ds.notFound, "Place"), StatusCodes.NOT_FOUND),
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

  const url =
    thirdPartyData.google?.thumbnail || thirdPartyData.yelp?.thumbnail;

  if (url && url !== "") {
    try {
      const response = await axios.get(url, {
        responseType: "arraybuffer",
      });

      const mimeType = response.headers["content-type"];

      const key = `places/${place._id.toString()}/thumbnail.${
        mimeType.split("/")[1]
      }`;

      const thumbnailURL = S3Manager.getURL(key);

      S3Manager.uploadImage(
        {
          mimetype: mimeType,
          stream: response.data,
        },
        key,
      );

      place.thumbnail = thumbnailURL;
    } catch (error) {
      logger.error("Error fetching thumbnail", { error });
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
          [GooglePlaceFields.ADVANCED],
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
          googlePlacesData.addressComponents,
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
