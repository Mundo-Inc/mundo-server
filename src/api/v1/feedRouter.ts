import express from "express";

import { authMiddleware } from "../middlewares/authMiddleWare";
import {
  activitySeen,
  activitySeenValidation,
  getComments,
  getCommentsValidation,
  getFeed,
  getFeedValidation,
} from "../controllers/FeedController";

const router = express.Router();
router.use(express.json());

router.get("/", authMiddleware, getFeedValidation, getFeed);

router.post("/:id", authMiddleware, activitySeenValidation, activitySeen);

router.get("/:id/comments", authMiddleware, getCommentsValidation, getComments);

export default router;
