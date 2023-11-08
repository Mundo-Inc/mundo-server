import express from "express";

import { authMiddleware } from "../middlewares/authMiddleWare";
import {
  activitySeen,
  activitySeenValidation,
  getActivity,
  getActivityValidation,
  getComments,
  getCommentsValidation,
  getFeed,
  getFeedValidation,
} from "../controllers/FeedController";

const router = express.Router();
router.use(express.json());

router.get("/", authMiddleware, getFeedValidation, getFeed);

router
  .route("/:id")
  .get(authMiddleware, getActivityValidation, getActivity)
  .post(authMiddleware, activitySeenValidation, activitySeen);

router.get("/:id/comments", authMiddleware, getCommentsValidation, getComments);

export default router;
