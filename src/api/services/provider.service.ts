import axios from "axios";
import { StatusCodes } from "http-status-codes";

import type { IPlace } from "../../models/Place";
import type { IGPPlaceDetails } from "../../types/googleplaces.interface";
import type { IYelpPlaceDetails } from "../../types/yelpPlace.interface";
import { createError } from "../../utilities/errorHandlers";
import logger from "./logger";

const YELP_FUSION_API_KEY = process.env.YELP_FUSION_API_KEY;
const FOURSQUARE_API_KEY = process.env.FOURSQUARE_API_KEY;

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
export const findYelpId = async (place: IPlace) => {
  try {
    let url = `https://api.yelp.com/v3/businesses/matches?name=${place.name}&address1=${place.location.address}&city=${place.location.city}&state=${place.location.state}&country=${place.location.country}&latitude=${place.location.geoLocation.coordinates[1]}&longitude=${place.location.geoLocation.coordinates[0]}`;
    url = url.replaceAll("#", "");
    const yelpResult = await axios({
      method: "get",
      url: url,
      headers: {
        Authorization: `Bearer ${YELP_FUSION_API_KEY}`,
        Accept: "application/json",
      },
    });

    if (yelpResult.status === 200) {
      if (yelpResult.data.businesses.length >= 1) {
        return yelpResult.data.businesses[0].id;
      } else {
        throw createError(`Yelp place not found!`, StatusCodes.NOT_FOUND);
      }
    } else {
      logger.debug("yelp result", { yelpResult });
      throw createError(
        `Unexpected response. Status: ${yelpResult.status}`,
        yelpResult.status
      );
    }
  } catch (error: any) {
    console.error("Error fetching Yelp id for placeId:", place.id, error);
    throw createError(
      `Invalid third party data.`,
      StatusCodes.INTERNAL_SERVER_ERROR
    );
  }
};

export async function getYelpData(yelpId: string) {
  try {
    const yelpResult = await axios<IYelpPlaceDetails>({
      method: "get",
      url: `https://api.yelp.com/v3/businesses/${yelpId}`, // fixed extra }
      headers: {
        Authorization: `Bearer ${YELP_FUSION_API_KEY}`,
        Accept: "application/json",
      },
    });

    if (yelpResult.status === 200) {
      return yelpResult.data;
    } else {
      logger.debug("yelp result", { yelpResult });
      throw createError("Unexpected response. Status", yelpResult.status);
    }
  } catch (error) {
    console.error("Error fetching Yelp rating:", error);
    throw createError(
      "Something went wrong",
      StatusCodes.INTERNAL_SERVER_ERROR
    );
  }
}

export const getYelpReviews = async (yelpId: string) => {
  try {
    const yelpResult = await axios({
      method: "get",
      url: `https://api.yelp.com/v3/businesses/${yelpId}/reviews?limit=20&sort_by=yelp_sort`, // fixed extra }
      headers: {
        Authorization: `Bearer ${YELP_FUSION_API_KEY}`,
        Accept: "application/json",
      },
    });

    if (yelpResult.status === 200) {
      return {
        reviews: yelpResult.data.reviews,
      };
    } else {
      logger.debug("yelp result", { yelpResult });
      throw createError("Unexpected response.", yelpResult.status);
    }
  } catch (error) {
    console.error("Error fetching Yelp rating:", error);
    throw createError(
      "Something went wrong",
      StatusCodes.INTERNAL_SERVER_ERROR
    );
  }
};

export const findGooglePlacesId = async (
  place: IPlace
): Promise<string | null> => {
  try {
    const radiusToSearch = 50; // meters
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json`,
      {
        params: {
          location: `${place.location.geoLocation.coordinates[1]},${place.location.geoLocation.coordinates[0]}`,
          radius: radiusToSearch,
          keyword: place.name,
          key: GOOGLE_PLACES_API_KEY,
        },
      }
    );

    if (
      response.status === 200 &&
      response.data.results &&
      response.data.results.length > 0
    ) {
      const placeId = response.data.results[0].place_id;
      return placeId; // returning the Google Place ID as a string.
    } else if (response.data.results && response.data.results.length === 0) {
      console.error("No matching places found");
      return null;
    } else {
      throw createError("Unexpected response.", response.status);
    }
  } catch (error) {
    console.error("Error fetching Google id:", error);
    throw createError(
      "Something went wrong",
      StatusCodes.INTERNAL_SERVER_ERROR
    );
  }
};

export const getGooglePlacesData = async (googlePlacesId: string) => {
  try {
    const placeRes = await axios(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${googlePlacesId}&key=${GOOGLE_PLACES_API_KEY}`
    );

    if (placeRes.status === 200) {
      const res = (placeRes.data as IGPPlaceDetails).result;
      // Check if there are any photos available for the place
      if (res.photos && res.photos.length > 0) {
        // Use the photo_reference of the first photo to construct the URL of the image
        const photoReference = res.photos[0].photo_reference;
        const maxWidth = 1024; // Set the desired maximum width of the image
        res.thumbnail = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photoreference=${photoReference}&key=${GOOGLE_PLACES_API_KEY}`;
      }
      return res;
    } else {
      throw createError("Unexpected response.", placeRes.status);
    }
  } catch (error) {
    console.error("Error fetching Google rating:", error);
    throw createError(
      "Something went wrong",
      StatusCodes.INTERNAL_SERVER_ERROR
    );
  }
};

export const findTripAdvisorId = async (place: IPlace) => {
  return "";
};
export const getTripAdvisorRating = async (tripAdvisorId: string) => {
  return -1;
};

export const findFoursquareId = async (place: IPlace) => {
  try {
    const resault = await axios({
      method: "get",
      url: `https://api.foursquare.com/v3/places/match?name=${place.name}&address=${place.location.address}&city=${place.location.city}&state=${place.location.state}&postalCode=${place.location.zip}&cc=${place.location.country}`,
      headers: {
        Authorization: `${FOURSQUARE_API_KEY}`,
        Accept: "application/json",
      },
    });

    if (resault.status === 200 && resault.data.place) {
      return resault.data.place.fsq_id;
    } else {
      throw createError(
        `Unexpected response. Status: ${resault.status}`,
        resault.status
      );
    }
  } catch (error) {
    console.error("Error:", error);
    throw createError(
      "Something went wrong",
      StatusCodes.INTERNAL_SERVER_ERROR
    );
  }
};
export const getFoursquareRating = async (foursquareId: string) => {
  logger.debug("foursquareID", { foursquareId });

  return -1;
};
