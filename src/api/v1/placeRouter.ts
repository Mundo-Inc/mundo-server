import express from "express";
import rateLimit from "express-rate-limit";

import {
  createPlace,
  createPlaceValidation,
  getPlaces,
  getPlacesByContext,
  getPlacesByContextValidation,
  getPlacesValidation,
  getPlacesWithinBoundaries,
  getPlacesWithinBoundariesValidation,
} from "../controllers/PlaceController.js";
import {
  getExistInLists,
  getExistInListsValidation,
  getPlace,
  getPlaceMedia,
  getPlaceMediaValidation,
  getPlaceOverview,
  getPlaceOverviewValidation,
  getPlaceReviews,
  getPlaceReviewsValidation,
  getPlaceValidation,
} from "../controllers/SinglePlaceController.js";
import { authMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();

const getPlaceRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 15,
  message:
    "Too many requests to get place details from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

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
  .route("/:id/reviews")
  .get(
    express.json(),
    authMiddleware,
    getPlaceReviewsValidation,
    getPlaceReviews
  );

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
  .get(
    getPlaceRateLimiter,
    express.json(),
    authMiddleware,
    getPlaceValidation,
    getPlace
  );

export default router;
