export const readFormattedPlaceLocationProjection = {
  geoLocation: {
    lng: {
      $arrayElemAt: ["$location.geoLocation.coordinates", 0],
    },
    lat: {
      $arrayElemAt: ["$location.geoLocation.coordinates", 1],
    },
  },
  address: 1,
  city: 1,
  state: 1,
  country: 1,
  zip: 1,
};
