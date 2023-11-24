import express from "express";

import {
  getEngagements,
  getEngagementsValidation,
} from "../controllers/EngagementController";
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
import { authMiddleware } from "../middlewares/authMiddleWare";

const router = express.Router();
router.use(express.json());

router.get("/", authMiddleware, getFeedValidation, getFeed);

router
  .route("/:id")
  .get(authMiddleware, getActivityValidation, getActivity)
  .post(authMiddleware, activitySeenValidation, activitySeen);

router.get("/:id/comments", authMiddleware, getCommentsValidation, getComments);

router.get(
  "/:id/engagements",
  authMiddleware,
  getEngagementsValidation,
  getEngagements
);

export default router;
