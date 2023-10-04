import express from "express";

import {
  createPlace,
  createPlaceValidation,
  getPlaces,
  getPlacesValidation,
  getPlacesWithinBoundaries,
  getPlacesWithinBoundariesValidation,
  getThirdPartyRating,
  getThirdPartyRatingValidation,
  importPlaces,
} from "../controllers/PlaceController";

import {
  getPlace,
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

router.route("/import").post(express.json(), adminAuthMiddleware, importPlaces);

router
  .route("/:id/media")
  .get(express.json(), getPlaceMediaValidation, getPlaceMedia);

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
