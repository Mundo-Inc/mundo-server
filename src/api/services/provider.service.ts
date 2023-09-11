import axios from "axios";
import { IPlace } from "../../models/Place";
import { createError } from "../../utilities/errorHandlers";

const YELP_FUSION_API_KEY = process.env.YELP_FUSION_API_KEY;

export const findYelpId = async (place: IPlace) => {
  try {
    const yelpResult = await axios({
      method: "get",
      url: `https://api.yelp.com/v3/businesses/matches?name=${place.name}&address1=${place.location.address}&city=${place.location.city}&state=${place.location.state}&country=${place.location.country}&latitude=${place.location.geoLocation.coordinates[1]}&longitude=${place.location.geoLocation.coordinates[0]}`,
      headers: {
        Authorization: `Bearer ${YELP_FUSION_API_KEY}`,
        Accept: "application/json",
      },
    });

    if (yelpResult.status === 200 && yelpResult.data.businesses.length === 1) {
      return yelpResult.data.businesses[0].id;
    } else {
      throw createError(
        `Unexpected response. Status: ${yelpResult.status}`,
        yelpResult.status
      );
    }
  } catch (error) {
    console.error("Error:", error);
    throw error; // or return a default/fallback value if preferred
  }
};

export const getYelpRating = async (yelpId: string) => {
  try {
    const yelpResult = await axios({
      method: "get",
      url: `https://api.yelp.com/v3/businesses/${yelpId}`, // fixed extra }
      headers: {
        Authorization: `Bearer ${YELP_FUSION_API_KEY}`,
        Accept: "application/json",
      },
    });

    if (yelpResult.status === 200) {
      return yelpResult.data.rating;
    } else {
      console.log(yelpResult);
      throw new Error(`Unexpected response. Status: ${yelpResult.status}`);
    }
  } catch (error) {
    console.error("Error fetching Yelp rating:", error);
    throw error; // or return a default/fallback value if preferred
  }
};
