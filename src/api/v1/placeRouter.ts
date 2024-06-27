import express from "express";
import rateLimit from "express-rate-limit";

import {
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
router.use(express.json());

const getPlaceRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 15,
  message:
    "Too many requests to get place details from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

router.get("/", getPlacesValidation, getPlaces);

router.get(
  "/map",
  getPlacesWithinBoundariesValidation,
  getPlacesWithinBoundaries
);

router.get(
  "/context",
  authMiddleware,
  getPlacesByContextValidation,
  getPlacesByContext
);

router.get("/:id/media", getPlaceMediaValidation, getPlaceMedia);

router.get(
  "/:id/reviews",
  authMiddleware,
  getPlaceReviewsValidation,
  getPlaceReviews
);

router.get(
  "/:id/lists",
  authMiddleware,
  getExistInListsValidation,
  getExistInLists
);

// Place overview
router.get("/:id/overview", getPlaceOverviewValidation, getPlaceOverview);

// Detailed place info
router.get(
  "/:id",
  getPlaceRateLimiter,
  authMiddleware,
  getPlaceValidation,
  getPlace
);

export default router;
