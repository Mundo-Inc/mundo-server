import express from "express";

import {
  getGeoActivities,
  getGeoActivitiesValidation,
  getGeoLocation,
  getGeoLocationValidation,
} from "../controllers/MapController";

const router = express.Router();
router.use(express.json());

router.get("/geoLocation", getGeoLocationValidation, getGeoLocation);

router.get("/geoActivities", getGeoActivitiesValidation, getGeoActivities);

export default router;
