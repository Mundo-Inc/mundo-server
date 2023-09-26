type Status =
  | "OK"
  | "ZERO_RESULTS"
  | "OVER_QUERY_LIMIT"
  | "REQUEST_DENIED"
  | "INVALID_REQUEST"
  | "UNKNOWN_ERROR";

type BusinessStatus =
  | "OPERATIONAL"
  | "CLOSED_TEMPORARILY"
  | "CLOSED_PERMANENTLY";

export interface IGPNearbySearch {
  html_attributions: any[];
  next_page_token: string;
  results: IGPNearbySearchResult[];
  status: Status;
}

export interface IGPNearbySearchResult {
  business_status: BusinessStatus;
  geometry: {
    location: { lat: number; lng: number };
    viewport: {
      northeast: { lat: number; lng: number };
      southwest: { lat: number; lng: number };
    };
  };
  icon: string;
  icon_background_color: string;
  icon_mask_base_uri: string;
  name: string;
  opening_hours: {
    open_now: boolean;
    periods: {
      close: { day: number; time: string };
      open: { day: number; time: string };
    }[];
    weekday_text: string[];
  };
  photos: {
    height: number;
    html_attributions: string[];
    photo_reference: string;
    width: number;
  }[];
  place_id: string;
  plus_code: { compound_code: string; global_code: string };
  price_level: number;
  rating: number;
  reference: string;
  scope: "GOOGLE";
  types: string[];
  user_ratings_total: number;
  vicinity: string;
}

export interface IGPPlaceDetails {
  html_attributions: any[];
  result: IGPPlaceDetailsResult;
  status: Status;
}

export interface IGPPlaceDetailsResult {
  address_components?: {
    long_name: string;
    short_name: string;
    types: string[];
  }[];
  adr_address?: string;
  business_status?: BusinessStatus;
  formatted_address?: string;
  formatted_phone_number?: string;
  geometry?: {
    location: { lat: number; lng: number };
    viewport: {
      northeast: { lat: number; lng: number };
      southwest: { lat: number; lng: number };
    };
  };
  icon?: string;
  icon_background_color?: string;
  icon_mask_base_uri?: string;
  international_phone_number?: string;
  name?: string;
  opening_hours?: {
    open_now: boolean;
    periods: {
      close: { day: number; time: string };
      open: { day: number; time: string };
    }[];
    weekday_text: string[];
  };
  photos?: {
    height: number;
    html_attributions: string[];
    photo_reference: string;
    width: number;
  }[];
  place_id?: string;
  plus_code?: { compound_code: string; global_code: string };
  price_level?: number;
  rating?: number;
  reference?: string;
  reviews?: IGPReview[];
  scope?: "GOOGLE";
  types?: string[];
  url?: string;
  user_ratings_total?: number;
  utc_offset?: number;
  vicinity?: string;
  website?: string;
  wheelchair_accessible_entrance?: boolean;
}

export interface IGPReview {
  author_name: string;
  author_url: string;
  language: string;
  profile_photo_url: string;
  rating: number;
  relative_time_description: string;
  text: string;
  time: number;
  translated: boolean;
}
