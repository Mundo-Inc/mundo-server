import express from "express";

import {
  createReview,
  createReviewValidation,
} from "../controllers/review/createReview.js";
import {
  getReview,
  getReviewValidation,
} from "../controllers/review/getReview.js";
import {
  getReviews,
  getReviewsValidation,
} from "../controllers/review/getReviews.js";
import {
  removeReview,
  removeReviewValidation,
} from "../controllers/review/removeReview.js";
import { authMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();
router.use(express.json());
router.use(authMiddleware);

router
  .route("/")
  .get(getReviewsValidation, getReviews)
  .post(createReviewValidation, createReview);

router
  .route("/:reviewId")
  .get(getReviewValidation, getReview)
  .delete(removeReviewValidation, removeReview);

export default router;
