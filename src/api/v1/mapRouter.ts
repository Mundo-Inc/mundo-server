import express from "express";

import {
  getGeoLocation,
  getGeoLocationValidation,
} from "../controllers/MapController";

const router = express.Router();
router.use(express.json());

router.get("/geoLocation", getGeoLocationValidation, getGeoLocation);

export default router;
