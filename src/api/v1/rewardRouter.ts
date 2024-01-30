import express from "express";

import {
  claimMissionReward,
  claimMissionRewardValidation,
  createMission,
  createMissionValidation,
  createPrize,
  createPrizeValidation,
  deleteMission,
  deleteMissionValidation,
  getAllMissions,
  getMissions,
  getMissionsValidation,
  getPrizes,
  getPrizesValidation,
} from "../controllers/MissionController";
import {
  claimDailyCoins,
  claimDailyCoinsValidation,
  dailyCoinInformation,
  dailyCoinInformationValidation,
  getAllPrizeRedemptionHistory,
  getAllPrizeRedemptionHistoryValidation,
  getPrizeRedemptionHistory,
  getPrizeRedemptionHistoryValidation,
  redeemPrize,
  redeemPrizeValidation,
  reviewRedemption,
  reviewRedemptionValidation,
} from "../controllers/RewardController";
import {
  adminAuthMiddleware,
  authMiddleware,
} from "../middlewares/authMiddleWare";

const router = express.Router();
router.use(express.json());
router.use(authMiddleware);

router
  .route("/daily")
  .get(dailyCoinInformationValidation, dailyCoinInformation);
router.route("/daily/claim").post(claimDailyCoinsValidation, claimDailyCoins);

router
  .route("/missions")
  .get(getMissionsValidation, getMissions)
  .post(adminAuthMiddleware, createMissionValidation, createMission);

router
  .route("/missions/all")
  .get(adminAuthMiddleware, getMissionsValidation, getAllMissions);

router
  .route("/missions/:id")
  .delete(adminAuthMiddleware, deleteMissionValidation, deleteMission);

router
  .route("/missions/:id/claim")
  .post(claimMissionRewardValidation, claimMissionReward);

router
  .route("/prizes")
  .get(getPrizesValidation, getPrizes)
  .post(adminAuthMiddleware, createPrizeValidation, createPrize);

router.route("/prizes/:id/redeem").post(redeemPrizeValidation, redeemPrize);

router
  .route("/redemptions")
  .get(getPrizeRedemptionHistoryValidation, getPrizeRedemptionHistory);
router
  .route("/redemptions/all")
  .get(
    adminAuthMiddleware,
    getAllPrizeRedemptionHistoryValidation,
    getAllPrizeRedemptionHistory
  );
router
  .route("/redemptions/:id/review")
  .post(adminAuthMiddleware, reviewRedemptionValidation, reviewRedemption);

export default router;
