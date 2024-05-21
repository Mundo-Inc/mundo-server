import { type IPlace } from "../../models/Place.js";

const PlaceProjection = {
  detail: {
    _id: true,
    name: true,
    otherNames: true,
    description: true,
    location: true,
    phone: true,
    website: true,
    categories: true,
    owner: true,
    thumbnail: true,
    priceRange: true,
    scores: true,
    activities: true,
  },

  brief: {
    _id: true,
    name: true,
    categories: true,
    thumbnail: true,
    location: true,
  },

  locationProjection: {
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
};

// detail key union
export type PlacePublicKeys = keyof typeof PlaceProjection.detail;
export type PlaceProjectionDetail = Pick<IPlace, PlacePublicKeys>;

// brief key union
export type PlaceBriefKeys = keyof typeof PlaceProjection.brief;
export type PlaceProjectionBrief = Pick<IPlace, PlaceBriefKeys>;

export default PlaceProjection;
