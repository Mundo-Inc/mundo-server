import { Schema } from "mongoose";

import { AppleMapsSchema, type IAppleMaps } from "./AppleMaps";
import { GooglePlacesSchema, type IGooglePlaces } from "./GooglePlaces";
import { OSMSchema, type IOSM } from "./OSM";
import { YelpSchema, type IYelp } from "./Yelp";

export interface IOtherSources {
  OSM?: IOSM;
  appleMaps?: IAppleMaps;
  googlePlaces?: IGooglePlaces;
  yelp?: IYelp;
}

export const OtherScoresSchema = new Schema<IOtherSources>(
  {
    OSM: OSMSchema,
    appleMaps: AppleMapsSchema,
    googlePlaces: GooglePlacesSchema,
    yelp: YelpSchema,
  },
  { _id: false }
);
