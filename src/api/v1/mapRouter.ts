import express from "express";

import {
  getMapActivities,
  getMapActivitiesValidation,
} from "../controllers/MapController";
import { authMiddleware } from "../middlewares/authMiddleWare";

const router = express.Router();
router.use(express.json());
router.use(authMiddleware);

router.get("/mapActivities", getMapActivitiesValidation, getMapActivities);

export default router;
