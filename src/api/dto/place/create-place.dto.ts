import type { Types } from "mongoose";

export type CreatePlaceDto = {
  name: string;
  otherNames: string[];
  description: string;
  thumbnail: string;
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
  owner: Types.ObjectId;
  isActive?: boolean;
  yelpId?: string;
};
