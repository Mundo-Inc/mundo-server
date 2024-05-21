import express from "express";

import {
  createReview,
  createReviewValidation,
  getReview,
  getReviewValidation,
  getReviews,
  getReviewsValidation,
  removeReview,
  removeReviewValidation,
} from "../controllers/ReviewController.js";
import { authMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();
router.use(express.json());
router.use(authMiddleware);

router
  .route("/")
  .get(getReviewsValidation, getReviews)
  .post(createReviewValidation, createReview);

router
  .route("/:id")
  .get(getReviewValidation, getReview)
  .delete(removeReviewValidation, removeReview);

export default router;
