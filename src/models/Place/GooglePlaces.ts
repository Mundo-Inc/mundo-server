import { Schema } from "mongoose";

export interface IGooglePlaces {
  _id?: string;
  streetNumber?: string;
  streetName?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  address?: string;
  categories?: string[];
  rating?: number;
  updatedAt?: Date;
}

export const GooglePlacesSchema = new Schema<IGooglePlaces>({
  _id: String,
  rating: Number,
  streetNumber: String,
  streetName: String,
  city: String,
  state: String,
  zip: String,
  country: String,
  address: String,
  categories: [String],
  updatedAt: Date,
});
