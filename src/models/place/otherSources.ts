import { Schema } from "mongoose";

import { AppleMapsSchema, type IAppleMaps } from "./appleMaps.js";
import { GooglePlacesSchema, type IGooglePlaces } from "./googlePlaces.js";
import { OSMSchema, type IOSM } from "./osm.js";
import { YelpSchema, type IYelp } from "./yelp.js";

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
  { _id: false },
);
