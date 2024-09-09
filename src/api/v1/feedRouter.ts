import express from "express";

import {
  getActivity,
  getActivityValidation,
} from "../controllers/activity/getActivity.js";
import {
  getActivityComments,
  getActivityCommentsValidation,
} from "../controllers/activity/getActivityComments.js";
import {
  getEngagements,
  getEngagementsValidation,
} from "../controllers/activity/getEngagements.js";
import { getFeed, getFeedValidation } from "../controllers/activity/getFeed.js";
import { authMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();
router.use(express.json());

router.get("/", authMiddleware, getFeedValidation, getFeed);

router.route("/:id").get(authMiddleware, getActivityValidation, getActivity);

router.get(
  "/:activityId/comments",
  authMiddleware,
  getActivityCommentsValidation,
  getActivityComments,
);

router.get(
  "/:id/engagements",
  authMiddleware,
  getEngagementsValidation,
  getEngagements,
);

export default router;
