import axios from "axios";
import { StatusCodes } from "http-status-codes";

import type { IPlace } from "../../models/Place";
import type { IYelpPlaceDetails } from "../../types/yelpPlace.interface";
import { createError } from "../../utilities/errorHandlers";
import logger from "./logger";

const YELP_FUSION_API_KEY = process.env.YELP_FUSION_API_KEY;
const FOURSQUARE_API_KEY = process.env.FOURSQUARE_API_KEY;

export async function findYelpId(place: IPlace) {
  try {
    const url = new URL(
      `https://api.yelp.com/v3/businesses/matches?name=${place.name}&address1=${place.location.address}&city=${place.location.city}&state=${place.location.state}&country=${place.location.country}&latitude=${place.location.geoLocation.coordinates[1]}&longitude=${place.location.geoLocation.coordinates[0]}`.replaceAll(
        "#",
        ""
      )
    );

    const yelpResult = await axios({
      method: "get",
      url: url.href,
      headers: {
        Authorization: `Bearer ${YELP_FUSION_API_KEY}`,
        Accept: "application/json",
      },
    });

    if (yelpResult.status === 200 && yelpResult.data.businesses.length >= 1) {
      return yelpResult.data.businesses[0].id;
    } else {
      throw createError(`Yelp place not found!`, StatusCodes.NOT_FOUND);
    }
  } catch (error) {
    const url = new URL(
      `https://api.yelp.com/v3/businesses/search?latitude=${place.location.geoLocation.coordinates[1]}&longitude=${place.location.geoLocation.coordinates[0]}&term=${place.name}`
    );

    const yelpResult = await axios({
      method: "get",
      url: url.href,
      headers: {
        Authorization: `Bearer ${YELP_FUSION_API_KEY}`,
        Accept: "application/json",
      },
    });

    if (yelpResult.status === 200 && yelpResult.data.businesses.length >= 1) {
      return yelpResult.data.businesses[0].id;
    } else {
      throw createError(`Yelp place not found!`, StatusCodes.NOT_FOUND);
    }
  }
}

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
      url: `https://api.yelp.com/v3/businesses/${yelpId}/reviews?limit=20&sort_by=yelp_sort`,
      headers: {
        Authorization: `Bearer ${YELP_FUSION_API_KEY}`,
        Accept: "application/json",
      },
    });

    if (yelpResult.status === 200) {
      return yelpResult.data.reviews;
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
