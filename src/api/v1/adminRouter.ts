import express from "express";

import {
  adminGetUsers,
  adminGetUsersValidation,
} from "../controllers/admin/adminGetUsers.js";
import {
  createBot,
  createBotValidation,
} from "../controllers/admin/createBot.js";
import {
  createDuty,
  createDutyValidation,
} from "../controllers/admin/createDuty.js";
import { getBot, getBotValidation } from "../controllers/admin/getBot.js";
import { getFlags, getFlagsValidation } from "../controllers/admin/getFlags.js";
import { getSettings } from "../controllers/admin/getSettings.js";
import {
  resolveFlag,
  resolveFlagValidation,
} from "../controllers/admin/resolveFlag.js";
import {
  updateSettings,
  updateSettingsValidation,
} from "../controllers/admin/updateSettings.js";
import { adminAuthMiddleware } from "../middlewares/authMiddleWare.js";

// Admin Only
const router = express.Router();
router.use(express.json());
router.use(adminAuthMiddleware);

router
  .route("/settings")
  .get(getSettings)
  .put(updateSettingsValidation, updateSettings);

router.route("/users").get(adminGetUsersValidation, adminGetUsers);

router.route("/flags").get(getFlagsValidation, getFlags);
router.route("/flags/:id").post(resolveFlagValidation, resolveFlag);

router.route("/bots/").post(createBotValidation, createBot);
router.route("/bots/:id").get(getBotValidation, getBot);
router.route("/bots/:id/duty").post(createDutyValidation, createDuty);

export default router;
