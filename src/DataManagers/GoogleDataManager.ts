import axios from "axios";

export class GoogleDataManager {
  private static BASE = "https://places.googleapis.com/v1";
  private static API_KEY = process.env.GOOGLE_PLACES_API_KEY!;

  private static FieldsIDsOnly = ["id", "photos"];
  private static FieldsLocationOnly = [
    "addressComponents",
    "location",
    "shortFormattedAddress",
    "types",
  ];
  private static FieldsBasic = [
    "accessibilityOptions",
    "displayName",
    "primaryType",
    "primaryTypeDisplayName",
  ];
  private static FieldsAdvanced = [
    "internationalPhoneNumber",
    "priceLevel",
    "rating",
    "regularOpeningHours",
    "userRatingCount",
    "websiteUri",
  ];
  private static FieldsPreferred = [
    "allowsDogs",
    "curbsidePickup",
    "delivery",
    "dineIn",
    "goodForChildren",
    "goodForGroups",
    "goodForWatchingSports",
    "liveMusic",
    "menuForChildren",
    "parkingOptions",
    "paymentOptions",
    "outdoorSeating",
    "reservable",
    "restroom",
    "reviews",
    "servesBeer",
    "servesBreakfast",
    "servesBrunch",
    "servesCocktails",
    "servesCoffee",
    "servesDessert",
    "servesDinner",
    "servesLunch",
    "servesVegetarianFood",
    "servesWine",
    "takeout",
  ];

  /**
   * Retrieves detailed information for a specific place using the Google Places API.
   * This method is designed to be flexible, allowing callers to specify a combination
   * of detail types through a generic type parameter and a corresponding array of fields.
   *
   * @template T This generic type parameter allows the caller to specify the expected
   *             types of place details beyond the basic ID information. It should reflect
   *             the union of different detail types (e.g., Basic and/or Advanced) based on
   *             the fields requested. The resulting promise resolves to an object that
   *             combines `GooglePlaceDetailsIDsOnly` with the specified detail types in `T`.
   *
   * @param {string} placeId The unique identifier for the place, typically provided by Google.
   * @param {GooglePlaceFields[]} fields An array of fields specifying the types of place details
   *                                     to be retrieved. The generic type `T` should correspond to
   *                                     the combined detail types associated with these fields.
   *
   * @returns {Promise<GooglePlaceDetailsIDsOnly & T>} A promise that resolves to an object containing
   *                                                   the requested place details. The structure of this object
   *                                                   combines `GooglePlaceDetailsIDsOnly` with the additional
   *                                                   details specified by `T`, based on the requested fields.
   *
   * @example
   * // To retrieve both basic and advanced details for a place, along with ID information:
   * const data = await GoogleDataManager.getPlaceDetails<
   *   GooglePlaceDetailsBasic & GooglePlaceDetailsAdvanced
   * >("PLACE_ID", [
   *   GooglePlaceFields.BASIC,
   *   GooglePlaceFields.ADVANCED,
   * ]);
   */
  public static async getPlaceDetails<T>(
    placeId: string,
    fields: GooglePlaceFields[]
  ): Promise<GooglePlaceDetailsIDsOnly & T> {
    if (!placeId) {
      throw new Error("Place ID cannot be empty");
    }
    if (fields.length === 0) {
      throw new Error("Fields cannot be empty");
    }

    const allFields = GoogleDataManager.FieldsIDsOnly;

    if (fields.includes(GooglePlaceFields.LOCATION)) {
      allFields.push(...GoogleDataManager.FieldsLocationOnly);
    }
    if (fields.includes(GooglePlaceFields.BASIC)) {
      allFields.push(...GoogleDataManager.FieldsBasic);
    }
    if (fields.includes(GooglePlaceFields.ADVANCED)) {
      allFields.push(...GoogleDataManager.FieldsAdvanced);
    }
    if (fields.includes(GooglePlaceFields.PREFERRED)) {
      allFields.push(...GoogleDataManager.FieldsPreferred);
    }

    const url = new URL(`${GoogleDataManager.BASE}/places/${placeId}`);
    url.searchParams.append("fields", allFields.join(","));
    url.searchParams.append("key", GoogleDataManager.API_KEY);

    try {
      const data = await axios.get<GooglePlaceDetailsIDsOnly & T>(url.href);
      return data.data;
    } catch (error: any) {
      if (error.response?.status) {
        switch (error.response.status) {
          case 400:
            throw new Error(GooglePlacesDataManagerError.PLACE_NOT_FOUND);
          case 404:
            throw new Error(GooglePlacesDataManagerError.PLACE_NOT_FOUND);
          default:
            throw new Error(GooglePlacesDataManagerError.SOMETHING_WENT_WRONG);
        }
      }
      throw new Error(GooglePlacesDataManagerError.SOMETHING_WENT_WRONG);
    }
  }
}

enum GooglePlacesDataManagerError {
  PLACE_NOT_FOUND = "PLACE_NOT_FOUND",
  SOMETHING_WENT_WRONG = "SOMETHING_WENT_WRONG",
}

interface GooglePlaceDetailsIDsOnly {
  // IDs only
  id: string;
  photos: Photo[];
}

export interface GooglePlaceDetailsBasic {
  // Basic
  accessibilityOptions: AccessibilityOptions;
  displayName: LocalizedText;
  primaryType: string;
  primaryTypeDisplayName: LocalizedText;
}

export interface GooglePlaceLocationOnly {
  // Location Only
  addressComponents: AddressComponent[];
  location: LatLng;
  shortFormattedAddress: string;
  types: string[];
}

export interface GooglePlaceDetailsAdvanced {
  // Advanced
  internationalPhoneNumber: string;
  priceLevel: PriceLevel;
  rating: number;
  regularOpeningHours: OpeningHours;
  userRatingCount: number;
  websiteUri: string;
}

export interface GooglePlaceDetailsPreferred {
  allowsDogs: boolean;
  curbsidePickup: boolean;
  delivery: boolean;
  dineIn: boolean;
  goodForChildren: boolean;
  goodForGroups: boolean;
  goodForWatchingSports: boolean;
  liveMusic: boolean;
  menuForChildren: boolean;
  parkingOptions: ParkingOptions;
  paymentOptions: PaymentOptions;
  outdoorSeating: boolean;
  reservable: boolean;
  restroom: boolean;
  reviews: GooglePlaceReview[];
  servesBeer: boolean;
  servesBreakfast: boolean;
  servesBrunch: boolean;
  servesCocktails: boolean;
  servesCoffee: boolean;
  servesDessert: boolean;
  servesDinner: boolean;
  servesLunch: boolean;
  servesVegetarianFood: boolean;
  servesWine: boolean;
  takeout: boolean;
}

type AccessibilityOptions = {
  wheelchairAccessibleParking: boolean;
  wheelchairAccessibleEntrance: boolean;
  wheelchairAccessibleRestroom: boolean;
  wheelchairAccessibleSeating: boolean;
};

type PaymentOptions = {
  acceptsCreditCards: boolean;
  acceptsDebitCards: boolean;
  acceptsCashOnly: boolean;
  acceptsNfc: boolean;
};

type ParkingOptions = {
  freeParkingLot: boolean;
  paidParkingLot: boolean;
  freeStreetParking: boolean;
  paidStreetParking: boolean;
  valetParking: boolean;
  freeGarageParking: boolean;
  paidGarageParking: boolean;
};

type OpeningHours = {
  openNow: boolean;
  weekdayDescriptions: string[];
  periods: Period[];
};

type Photo = {
  name: string;
  widthPx: number;
  heightPx: number;
  authorAttributions: AuthorAttribution[];
};

type Period = {
  open: Point;
  close: Point;
};

type Point = {
  day: number;
  hour: number;
  minute: number;
};

type AddressComponent = {
  longName: string;
  shortName: string;
  types: string[];
  languageCode: string;
};

type LatLng = {
  latitute: number;
  longitude: number;
};
type LocalizedText = {
  text: string;
  languageCode: string;
};

type GooglePlaceReview = {
  name: string;
  relativePublishTimeDescription: string;
  text: LocalizedText;
  originalText: LocalizedText;
  rating: number;
  authorAttribution: AuthorAttribution;
  publishTime: string;
};
type AuthorAttribution = {
  displayName: string;
  uri: string;
  photoUri: string;
};

export enum PriceLevel {
  PRICE_LEVEL_UNSPECIFIED = "PRICE_LEVEL_UNSPECIFIED",
  PRICE_LEVEL_FREE = "PRICE_LEVEL_FREE",
  PRICE_LEVEL_INEXPENSIVE = "PRICE_LEVEL_INEXPENSIVE",
  PRICE_LEVEL_MODERATE = "PRICE_LEVEL_MODERATE",
  PRICE_LEVEL_EXPENSIVE = "PRICE_LEVEL_EXPENSIVE",
  PRICE_LEVEL_VERY_EXPENSIVE = "PRICE_LEVEL_VERY_EXPENSIVE",
}

export enum GooglePlaceFields {
  BASIC = "basic",
  LOCATION = "location",
  ADVANCED = "advanced",
  PREFERRED = "preferred",
}
