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
} from "../controllers/PlaceController";
import {
  getExistInLists,
  getExistInListsValidation,
  getPlace,
  getPlaceExists,
  getPlaceExistsValidation,
  getPlaceMedia,
  getPlaceMediaValidation,
  getPlaceOverview,
  getPlaceOverviewValidation,
  getPlaceReviews,
  getPlaceReviewsValidation,
  getPlaceValidation,
} from "../controllers/SinglePlaceController";
import { authMiddleware } from "../middlewares/authMiddleWare";

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
    authMiddleware,
    getPlacesByContextValidation,
    getPlacesByContext
  );

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
    authMiddleware,
    getPlaceReviewsValidation,
    getPlaceReviews
  );

router
  .route("/:id/rating/:provider")
  .get(express.json(), getThirdPartyRatingValidation, getThirdPartyRating);

router
  .route("/:id/lists")
  .get(
    express.json(),
    authMiddleware,
    getExistInListsValidation,
    getExistInLists
  );

// Place overview
router
  .route("/:id/overview")
  .get(express.json(), getPlaceOverviewValidation, getPlaceOverview);

// Detailed place info
router
  .route("/:id")
  .get(express.json(), authMiddleware, getPlaceValidation, getPlace);

export default router;
