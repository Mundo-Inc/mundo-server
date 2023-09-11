import express from "express";

import {
  createPlace,
  createPlaceValidation,
  getPlace,
  getPlaceValidation,
  getPlaces,
  getPlacesValidation,
  getThirdPartyRatingValidation,
  getThirdPartyRating,
} from "../controllers/PlaceController";
import {
  authMiddleware,
  optionalAuthMiddleware,
} from "../middlewares/authMiddleWare";

const router = express.Router();

router
  .route("/")
  .get(express.json(), getPlacesValidation, getPlaces)
  .post(authMiddleware, createPlaceValidation, createPlace);

router
  .route("/:id/rating/:provider")
  .get(express.json(), getThirdPartyRatingValidation, getThirdPartyRating);

router
  .route("/:id")
  .get(express.json(), optionalAuthMiddleware, getPlaceValidation, getPlace);

export default router;
