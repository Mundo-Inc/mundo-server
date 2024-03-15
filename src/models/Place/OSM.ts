import { Schema } from "mongoose";

export interface IOSM {
  _id?: string;
  tags?: {
    air_conditioning?: string;
    amenity?: string;
    brand?: string;
    instagram?: string;
    phone?: string;
    website?: string;
    cuisine?: string;
    delivery?: string;
    internet_access?: string;
    opening_hours?: string;
    takeaway?: string;
    wheelchair?: string;
  };
  updatedAt?: Date;
}

export const OSMSchema = new Schema<IOSM>({
  _id: String,
  tags: {
    air_conditioning: String,
    amenity: String,
    brand: String,
    instagram: String,
    phone: String,
    website: String,
    cuisine: String,
    delivery: String,
    internet_access: String,
    opening_hours: String,
    takeaway: String,
    wheelchair: String,
  },
  updatedAt: Date,
});
