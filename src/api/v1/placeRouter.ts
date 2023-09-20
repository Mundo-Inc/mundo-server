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
  getPlacesWithinBoundaries,
  getPlacesWithinBoundariesValidation,
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
  .route("/map")
  .get(
    express.json(),
    getPlacesWithinBoundariesValidation,
    getPlacesWithinBoundaries
  );

router.route("/import").post(express.json(), adminAuthMiddleware, importPlaces);


router
  .route("/:id/rating/:provider")
  .get(express.json(), getThirdPartyRatingValidation, getThirdPartyRating);

router
  .route("/:id")
  .get(express.json(), optionalAuthMiddleware, getPlaceValidation, getPlace);


export default router;
