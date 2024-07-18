import express from "express";

import {
  getNotifications,
  getNotificationsValidation,
} from "../controllers/notification/getNotifications.js";
import {
  readNotifications,
  readNotificationsValidation,
} from "../controllers/notification/readNotifications.js";
import { authMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();
router.use(express.json());
router.use(authMiddleware);

router.get("/", getNotificationsValidation, getNotifications);

router.put("/read", readNotificationsValidation, readNotifications);

export default router;
