export interface IYelpPlaceDetails {
  id: string;
  alias: string;
  name: string;
  image_url?: string;
  is_claimed: boolean;
  is_closed?: boolean;
  url?: string;
  review_count: number;
  categories?: { alias: string; title: string }[];
  rating?: string;
  coordinates: { latitude: number; longitude: number };
  transactions?: string[];
  price?: string;
  location: {
    address1?: string;
    address2?: string;
    address3?: string;
    city?: string;
    zip_code?: string;
    country?: string;
    state?: string;
    display_address: string[];
    cross_streets?: string;
  };
  phone: string;
  display_phone: string;
  distance?: string; // in meters
  hours: {
    hour_type: string;
    open: {
      day: number;
      start: string;
      end: string;
      is_overnight: boolean;
    }[];
    is_open_now: boolean;
  }[];
  date_opened?: string;
  date_closed?: string;
  photos: string[];
  special_hours?: {
    date: string;
    start: string;
    end: string;
    is_overnight: boolean;
    is_closed: boolean;
  }[];
}
