import express from "express";

import { authMiddleware } from "../middlewares/authMiddleWare";
import {
  getNotifications,
  getNotificationsValidation,
  readNotifications,
  readNotificationsValidation,
} from "../controllers/NotificationController";

const router = express.Router();
router.use(express.json());

router
  .route("/")
  .get(authMiddleware, getNotificationsValidation, getNotifications);

router
  .route("/read")
  .put(authMiddleware, readNotificationsValidation, readNotifications);

export default router;
