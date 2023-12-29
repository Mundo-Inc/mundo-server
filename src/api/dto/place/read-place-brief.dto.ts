import type { Types } from "mongoose";

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

type ReadPlaceBriefProjection = {
  [Property in keyof ReadPlaceBriefDto]?: boolean | 0 | 1;
};

export const readPlaceBriefProjection: ReadPlaceBriefProjection = {
  _id: true,
  name: true,
  categories: true,
  thumbnail: true,
  location: true,
};
