import { Schema } from "mongoose";

import { AppleMapsSchema, type IAppleMaps } from "./AppleMaps.js";
import { GooglePlacesSchema, type IGooglePlaces } from "./GooglePlaces.js";
import { OSMSchema, type IOSM } from "./OSM.js";
import { YelpSchema, type IYelp } from "./Yelp.js";

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
