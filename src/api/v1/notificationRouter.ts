import express from "express";

import { authMiddleware } from "../middlewares/authMiddleWare";
import {
  getNotifications,
  getNotificationsValidation,
} from "../controllers/NotificationController";

const router = express.Router();
router.use(express.json());

router
  .route("/")
  .get(authMiddleware, getNotificationsValidation, getNotifications);

export default router;
