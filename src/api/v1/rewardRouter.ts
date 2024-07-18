import express from "express";

import { claimDailyCoins } from "../controllers/reward/claimDailyCoins.js";
import {
  claimMissionReward,
  claimMissionRewardValidation,
} from "../controllers/reward/claimMissionReward.js";
import { dailyCoinInformation } from "../controllers/reward/dailyCoinInformation.js";
import {
  getMissions,
  getMissionsValidation,
} from "../controllers/reward/getMissions.js";
import {
  getPrizeRedemptionHistory,
  getPrizeRedemptionHistoryValidation,
} from "../controllers/reward/getPrizeRedemptionHistory.js";
import { getPrizes } from "../controllers/reward/getPrizes.js";
import {
  redeemPrize,
  redeemPrizeValidation,
} from "../controllers/reward/redeemPrize.js";
import { authMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();
router.use(express.json());
router.use(authMiddleware);

router.get("/daily", dailyCoinInformation);
router.post("/daily/claim", claimDailyCoins);

router.get("/missions", getMissionsValidation, getMissions);

router.post(
  "/missions/:id/claim",
  claimMissionRewardValidation,
  claimMissionReward
);

router.get("/prizes", getPrizes);

router.post("/prizes/:id/redeem", redeemPrizeValidation, redeemPrize);

router
  .route("/redemptions")
  .get(getPrizeRedemptionHistoryValidation, getPrizeRedemptionHistory);

export default router;
