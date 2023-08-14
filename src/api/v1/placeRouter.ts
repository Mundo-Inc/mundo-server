import express from "express";

import {
  createPlace,
  createPlaceValidation,
  getPlace,
  getPlaceValidation,
  getPlaces,
  getPlacesValidation,
} from "../controllers/PlaceController";
import {
  authMiddleware,
  optionalAuthMiddleware,
} from "../middlewares/authMiddleWare";

const router = express.Router();
router.use(express.json());

router
  .route("/")
  .get(getPlacesValidation, getPlaces)
  .post(authMiddleware, createPlaceValidation, createPlace);

router.route("/:id").get(optionalAuthMiddleware, getPlaceValidation, getPlace);

export default router;
