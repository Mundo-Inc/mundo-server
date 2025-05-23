import express from "express";

import {
  getMapActivities,
  getMapActivitiesValidation,
} from "../controllers/map/getMapActivities.js";
import { authMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();
router.use(express.json());
router.use(authMiddleware);

router.get("/mapActivities", getMapActivitiesValidation, getMapActivities);

export default router;
