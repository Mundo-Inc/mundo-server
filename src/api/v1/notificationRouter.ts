import express from "express";

import {
  getNotifications,
  getNotificationsValidation,
  readNotifications,
  readNotificationsValidation,
} from "../controllers/NotificationController.js";
import { authMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();
router.use(express.json());

router
  .route("/")
  .get(authMiddleware, getNotificationsValidation, getNotifications);

router
  .route("/read")
  .put(authMiddleware, readNotificationsValidation, readNotifications);

export default router;
