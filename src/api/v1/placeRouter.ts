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
  importPlaces,
} from "../controllers/PlaceController";
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
  .route("/:id/rating/:provider")
  .get(express.json(), getThirdPartyRatingValidation, getThirdPartyRating);

router
  .route("/:id")
  .get(express.json(), optionalAuthMiddleware, getPlaceValidation, getPlace);

router.route("/import").post(express.json(), adminAuthMiddleware, importPlaces);

export default router;
