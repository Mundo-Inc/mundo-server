import type { Types } from "mongoose";

export type ReadPlaceBriefDto = {
  _id: string;
  name: string;
  location: {
    geoLocation: {
      type: string;
      coordinates: number[];
    };
  };
  categories: Types.ObjectId[];
  owner: Types.ObjectId;
};

type ReadPlaceBriefProjection = {
  [Property in keyof ReadPlaceBriefDto]?: boolean;
};

export const readPlaceBriefProjection: ReadPlaceBriefProjection = {
  _id: true,
  name: true,
  location: true,
  categories: true,
  owner: true,
};
