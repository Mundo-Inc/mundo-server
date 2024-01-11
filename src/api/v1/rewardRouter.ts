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
  createMission,
  createMissionValidation,
  getMissions,
  getMissionsValidation,
} from "../controllers/MissionController";

const router = express.Router();
router.use(express.json());
router.use(authMiddleware);

// router.route("/");

router
  .route("/daily")
  .get(dailyCoinInformationValidation, dailyCoinInformation);
router.route("/daily/claim").get(claimDailyCoinsValidation, claimDailyCoins);

router
  .route("/missions")
  .get(authMiddleware, getMissionsValidation, getMissions)
  .post(adminAuthMiddleware, createMissionValidation, createMission);

export default router;
