import { Schema } from "mongoose";

export interface IOSM {
  _id?: string;
  tags: {
    air_conditioning?: boolean;
    amenity?: string;
    brand?: string;
    instagram?: string;
    phone?: string;
    website?: string;
    cuisine?: string;
    delivery?: boolean;
    internet_access?: boolean;
    opening_hours?: string;
    takeaway?: boolean;
    wheelchair?: boolean;
  };
  updatedAt?: Date;
}

export const OSMSchema = new Schema<IOSM>({
  _id: {
    type: String,
    default: null,
  },
  tags: {
    air_conditioning: Boolean,
    amenity: String,
    brand: String,
    instagram: String,
    phone: String,
    website: String,
    cuisine: String,
    delivery: Boolean,
    internet_access: Boolean,
    opening_hours: String,
    takeaway: Boolean,
    wheelchair: Boolean,
  },
  updatedAt: Date,
});
