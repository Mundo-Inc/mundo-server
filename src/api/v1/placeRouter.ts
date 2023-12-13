import express from "express";

import {
  createPlace,
  createPlaceValidation,
  getPlaces,
  getPlacesByContext,
  getPlacesByContextValidation,
  getPlacesValidation,
  getPlacesWithinBoundaries,
  getPlacesWithinBoundariesValidation,
  getThirdPartyRating,
  getThirdPartyRatingValidation,
  importPlaces,
} from "../controllers/PlaceController";

import {
  getPlace,
  getPlaceExists,
  getPlaceExistsValidation,
  getPlaceMedia,
  getPlaceMediaValidation,
  getPlaceReviews,
  getPlaceReviewsValidation,
  getPlaceValidation,
} from "../controllers/SinglePlaceController";

import {
  adminAuthMiddleware,
  authMiddleware,
  optionalAuthMiddleware,
} from "../middlewares/authMiddleWare";
import {
  searchPlaces,
  searchPlacesValidation,
} from "../controllers/PlaceSearchController";

const router = express.Router();

router
  .route("/")
  .get(express.json(), getPlacesValidation, getPlaces)
  .post(authMiddleware, createPlaceValidation, createPlace);

router
  .route("/map")
  .get(
    express.json(),
    getPlacesWithinBoundariesValidation,
    getPlacesWithinBoundaries
  );

router
  .route("/context")
  .get(
    express.json(),
    optionalAuthMiddleware,
    getPlacesByContextValidation,
    getPlacesByContext
  );

router
  .route("/search")
  .get(express.json(), searchPlacesValidation, searchPlaces);

router.route("/import").post(express.json(), adminAuthMiddleware, importPlaces);

router
  .route("/:id/media")
  .get(express.json(), getPlaceMediaValidation, getPlaceMedia);

router
  .route("/:id/exists")
  .get(express.json(), getPlaceExistsValidation, getPlaceExists);

router
  .route("/:id/reviews")
  .get(
    express.json(),
    optionalAuthMiddleware,
    getPlaceReviewsValidation,
    getPlaceReviews
  );

router
  .route("/:id/rating/:provider")
  .get(express.json(), getThirdPartyRatingValidation, getThirdPartyRating);

router
  .route("/:id")
  .get(express.json(), optionalAuthMiddleware, getPlaceValidation, getPlace);

export default router;
