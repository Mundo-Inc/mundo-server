import type { Types } from "mongoose";

export type EditPlaceDto = {
  name: string;
  otherNames: string[];
  description: string;
  location: {
    geoLocation: {
      type?: string;
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
};
