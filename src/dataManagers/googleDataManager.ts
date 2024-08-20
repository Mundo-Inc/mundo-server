import axios from "axios";
import logger from "../api/services/logger/index.js";
import { env } from "../env.js";

export class GoogleDataManager {
  private static BASE = "https://places.googleapis.com/v1";
  private static API_KEY = env.GOOGLE_PLACES_API_KEY;

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
    fields: GooglePlaceFields[],
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
      logger.http("Getting google place details", { url: url.href });
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
            logger.error("Error getting google place details", { error });
            throw new Error(GooglePlacesDataManagerError.SOMETHING_WENT_WRONG);
        }
      }
      logger.error("Error getting google place details", { error });
      throw new Error(GooglePlacesDataManagerError.SOMETHING_WENT_WRONG);
    }
  }

  public static async getPlaceId(
    textQuery: string,
    locationBias: {
      lat: number;
      lng: number;
      radius?: number;
    } | null = null,
  ) {
    if (!textQuery || textQuery === "") {
      throw new Error("Text query cannot be empty");
    }

    const url = new URL(`${GoogleDataManager.BASE}/places:searchText`);

    const headers = {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GoogleDataManager.API_KEY,
      "X-Goog-FieldMask": "places.id",
    };

    const body: {
      textQuery: string;
      maxResultCount?: number;
      locationBias?: {
        circle: {
          center: {
            latitude: number;
            longitude: number;
          };
          radius: number;
        };
      };
    } = {
      textQuery,
      maxResultCount: 1,
    };

    if (locationBias) {
      body["locationBias"] = {
        circle: {
          center: {
            latitude: locationBias?.lat,
            longitude: locationBias?.lng,
          },
          radius: locationBias?.radius || 50,
        },
      };
    }

    try {
      const data = await axios.post<GooglePlaceTextSearchResponse>(
        url.href,
        body,
        { headers },
      );
      return data.data.places[0].id;
    } catch (error: any) {
      logger.error("Error getting google place id using Text Search", {
        error,
      });
      throw new Error(GooglePlacesDataManagerError.SOMETHING_WENT_WRONG);
    }
  }

  /**
   * Retrieves a photo for a specific place using the Google Places API.
   * @param name `places/....`
   *             - Consists of `places/${placeId}/photos/${photoReference}`
   * @param maxWidthPx default 1080
   * @param maxHeightPx default 1920
   * @returns {Promise<string>} A promise that resolves to a string containing the photo URI.
   */
  public static async getPhoto(
    name: string,
    maxWidthPx: number = 1080,
    maxHeightPx: number = 1920,
  ): Promise<string> {
    const url = new URL(`${GoogleDataManager.BASE}/${name}/media`);
    url.searchParams.append("maxWidthPx", maxWidthPx.toString());
    url.searchParams.append("maxHeightPx", maxHeightPx.toString());
    url.searchParams.append("skipHttpRedirect", "true");
    url.searchParams.append("key", GoogleDataManager.API_KEY);

    try {
      logger.http("Getting google photo", { url: url.href });
      const data = await axios.get<GooglePhotoResponse>(url.href);
      return data.data.photoUri;
    } catch (error: any) {
      logger.error("Error getting google photo", { error });
      throw new Error(GooglePlacesDataManagerError.SOMETHING_WENT_WRONG);
    }
  }

  static getAddressesFromComponents(components: AddressComponent[]) {
    if (!components || components.length === 0) {
      return {
        country: "",
        state: "",
        city: "",
        streetNumber: "",
        streetName: "",
        postalCode: "",
        address: "",
      };
    }

    const country = this.extractComponentAddressComponents(
      components,
      "country",
      true,
    );

    const state = this.extractComponentAddressComponents(
      components,
      "administrative_area_level_1",
      true,
    );

    let city = this.extractComponentAddressComponents(components, "locality");
    if (city === "") city = state;

    const streetNumber = this.extractComponentAddressComponents(
      components,
      "street_number",
    );

    const streetName = this.extractComponentAddressComponents(
      components,
      "route",
    );

    const postalCode = this.extractComponentAddressComponents(
      components,
      "postal_code",
    );

    const address = `${streetNumber} ${streetName}`;

    return {
      country,
      state,
      city,
      streetNumber,
      streetName,
      postalCode,
      address,
    };
  }

  private static extractComponentAddressComponents(
    components: AddressComponent[],
    type: string,
    useShortName: boolean = false,
  ) {
    const component = components.find((comp) => comp.types.includes(type));

    if (component) {
      return useShortName ? component.shortText : component.longText;
    } else {
      return "";
    }
  }
}

enum GooglePlacesDataManagerError {
  PLACE_NOT_FOUND = "PLACE_NOT_FOUND",
  SOMETHING_WENT_WRONG = "SOMETHING_WENT_WRONG",
}

interface GooglePlaceTextSearchResponse {
  places: {
    id: string;
  }[];
}

interface GooglePhotoResponse {
  name: string;
  photoUri: string;
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

export interface GooglePlaceDetailsLocationOnly {
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

export type OpeningHours = {
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
  longText: string;
  shortText: string;
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

export type GooglePlaceReview = {
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
