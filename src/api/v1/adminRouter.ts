import express from "express";

import {
  getFlags,
  getFlagsValidation,
  getSettings,
  getUsers,
  getUsersValidation,
  resolveFlag,
  resolveFlagValidation,
  updateSettings,
  updateSettingsValidation,
} from "../controllers/AdminController";
import { adminAuthMiddleware } from "../middlewares/authMiddleWare";

// Admin Only
const router = express.Router();
router.use(express.json());
router.use(adminAuthMiddleware);

router
  .route("/settings")
  .get(getSettings)
  .put(updateSettingsValidation, updateSettings);

router.route("/users").get(getUsersValidation, getUsers);

router.route("/flags").get(getFlagsValidation, getFlags);

router.route("/flags/:id").post(resolveFlagValidation, resolveFlag);

export default router;
