import express from "express";

import {
  getEngagements,
  getEngagementsValidation,
} from "../controllers/EngagementController";
import {
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

router.route("/:id").get(authMiddleware, getActivityValidation, getActivity);
// .post(authMiddleware, activitySeenValidation, activitySeen); // TODO: This endpoint needs to be fixed

router.get("/:id/comments", authMiddleware, getCommentsValidation, getComments);

router.get(
  "/:id/engagements",
  authMiddleware,
  getEngagementsValidation,
  getEngagements
);

export default router;
