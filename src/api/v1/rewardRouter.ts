import express from "express";
import { authMiddleware } from "../middlewares/authMiddleWare";
import {
  claimDailyCoins,
  claimDailyCoinsValidation,
  dailyCoinInformation,
  dailyCoinInformationValidation,
} from "../controllers/RewardController";
import User from "../../models/User";

const router = express.Router();
router.use(express.json());
router.use(authMiddleware);

router.route("/");
//   .get(getReviewsValidation, getReviews)
//   .post(createReviewValidation, createReview);

router
  .route("/daily")
  .get(dailyCoinInformationValidation, dailyCoinInformation);
router.route("/daily/claim").get(claimDailyCoinsValidation, claimDailyCoins);

export default router;
