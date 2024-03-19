import express from "express";

import {
  getGeoActivities,
  getGeoActivitiesValidation,
  getGeoLocation,
  getGeoLocationValidation,
  getMapActivities,
  getMapActivitiesValidation,
} from "../controllers/MapController";
import { authMiddleware } from "../middlewares/authMiddleWare";

const router = express.Router();
router.use(express.json());

router.use(authMiddleware);

router.get("/geoLocation", getGeoLocationValidation, getGeoLocation);

router.get("/geoActivities", getGeoActivitiesValidation, getGeoActivities);

router.get("/mapActivities", getMapActivitiesValidation, getMapActivities);

export default router;
