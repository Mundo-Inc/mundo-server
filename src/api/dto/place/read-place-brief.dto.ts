import type { Types } from "mongoose";
import { readFormattedPlaceLocationProjection } from "./place-dto";

export type ReadPlaceBriefDto = {
  _id: string;
  name: string;
  thumbnail: string;
  categories: string[];
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
};

export const readPlaceBriefProjection: {
  [Property in keyof ReadPlaceBriefDto]?: boolean;
} = {
  _id: true,
  name: true,
  categories: true,
  thumbnail: true,
  location: true,
};
