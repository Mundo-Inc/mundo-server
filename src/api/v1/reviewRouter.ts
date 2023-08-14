import express from "express";

import {
  createReview,
  createReviewValidation,
  getReview,
  getReviewValidation,
  getReviews,
  getReviewsValidation,
} from "../controllers/ReviewController";
import { authMiddleware } from "../middlewares/authMiddleWare";

const router = express.Router();
router.use(express.json());

router
  .route("/")
  .get(authMiddleware, getReviewsValidation, getReviews)
  .post(authMiddleware, createReviewValidation, createReview);

router.route("/:id").get(authMiddleware, getReviewValidation, getReview);

export default router;
