import type { Types } from "mongoose";

export type ReadPlaceDetailDto = {
  _id: string;
  name: string;
  otherNames: string[];
  description: string;
  reviewCount: number;
  scores: {
    overall?: number;
    drinkQuality?: number;
    foodQuality?: number;
    atmosphere?: number;
    service?: number;
    value?: number;
    phantom?: number;
  };
  priceRange?: number;
  location: {
    geoLocation: {
      type: string;
      coordinates: number[];
    };
    address: string;
    city: string;
    state: string;
    country: string;
    zip: string;
  };
  phone: string;
  website: string;
  categories: Types.ObjectId[];
  owner: Types.ObjectId;
  thumbnail: string;
};

type ReadPlaceDetailProjection = {
  [Property in keyof ReadPlaceDetailDto]?: boolean | 0 | 1;
};

export const readPlaceDetailProjection: ReadPlaceDetailProjection = {
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
  reviewCount: true,
};
