import express from "express";

import {
  getGeoActivities,
  getGeoActivitiesValidation,
  getGeoLocation,
  getGeoLocationValidation,
} from "../controllers/MapController";
import { authMiddleware } from "../middlewares/authMiddleWare";

const router = express.Router();
router.use(express.json());

router.use(authMiddleware);

router.get("/geoLocation", getGeoLocationValidation, getGeoLocation);

router.get("/geoActivities", getGeoActivitiesValidation, getGeoActivities);

export default router;
