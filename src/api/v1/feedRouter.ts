import express from "express";

import { authMiddleware } from "../middlewares/authMiddleWare";
import {
  activitySeen,
  activitySeenValidation,
  getFeed,
  getFeedValidation,
} from "../controllers/FeedController";

const router = express.Router();
router.use(express.json());

router.get("/", authMiddleware, getFeedValidation, getFeed);

router.post("/:id", authMiddleware, activitySeenValidation, activitySeen);

export default router;
