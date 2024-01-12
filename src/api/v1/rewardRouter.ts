import express from "express";
import {
  adminAuthMiddleware,
  authMiddleware,
} from "../middlewares/authMiddleWare";
import {
  claimDailyCoins,
  claimDailyCoinsValidation,
  dailyCoinInformation,
  dailyCoinInformationValidation,
} from "../controllers/RewardController";
import {
  claimMissionReward,
  claimMissionRewardValidation,
  createMission,
  createMissionValidation,
  deleteMission,
  deleteMissionValidation,
  getAllMissions,
  getMissions,
  getMissionsValidation,
} from "../controllers/MissionController";

const router = express.Router();
router.use(express.json());
router.use(authMiddleware);

router
  .route("/daily")
  .get(dailyCoinInformationValidation, dailyCoinInformation);
router.route("/daily/claim").post(claimDailyCoinsValidation, claimDailyCoins);

router
  .route("/missions")
  .get(authMiddleware, getMissionsValidation, getMissions)
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
export default router;
