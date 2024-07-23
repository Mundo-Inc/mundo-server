import express from "express";
import rateLimit from "express-rate-limit";

import {
  getExistInLists,
  getExistInListsValidation,
} from "../controllers/place/getExistInLists.js";
import { getPlace, getPlaceValidation } from "../controllers/place/getPlace.js";
import {
  getPlaceMedia,
  getPlaceMediaValidation,
} from "../controllers/place/getPlaceMedia.js";
import {
  getPlaceOverview,
  getPlaceOverviewValidation,
} from "../controllers/place/getPlaceOverview.js";
import {
  getPlaceReviews,
  getPlaceReviewsValidation,
} from "../controllers/place/getPlaceReviews.js";
import {
  getPlacesByContext,
  getPlacesByContextValidation,
} from "../controllers/place/getPlacesByContext.js";
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

router.get(
  "/context",
  authMiddleware,
  getPlacesByContextValidation,
  getPlacesByContext,
);

router.get("/:placeId/media", getPlaceMediaValidation, getPlaceMedia);

router.get(
  "/:placeId/reviews",
  authMiddleware,
  getPlaceReviewsValidation,
  getPlaceReviews,
);

router.get(
  "/:placeId/lists",
  authMiddleware,
  getExistInListsValidation,
  getExistInLists,
);

// Place overview
router.get("/:placeId/overview", getPlaceOverviewValidation, getPlaceOverview);

// Detailed place info
router.get(
  "/:placeId",
  getPlaceRateLimiter,
  authMiddleware,
  getPlaceValidation,
  getPlace,
);

export default router;
