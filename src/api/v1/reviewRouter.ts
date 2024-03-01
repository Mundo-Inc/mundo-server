import express from "express";

import {
  createFlagReview,
  createFlagReviewValidation,
} from "../controllers/FlagController";
import {
  createReview,
  createReviewValidation,
  getReview,
  getReviewValidation,
  getReviews,
  getReviewsValidation,
  removeReview,
  removeReviewValidation,
} from "../controllers/ReviewController";
import { authMiddleware } from "../middlewares/authMiddleWare";

const router = express.Router();
router.use(express.json());

router
  .route("/")
  .get(authMiddleware, getReviewsValidation, getReviews)
  .post(authMiddleware, createReviewValidation, createReview);

router
  .route("/:id")
  .get(authMiddleware, getReviewValidation, getReview)
  .delete(authMiddleware, removeReviewValidation, removeReview);

router
  .route("/:id/flag")
  .post(authMiddleware, createFlagReviewValidation, createFlagReview);

export default router;
