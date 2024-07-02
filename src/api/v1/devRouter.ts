import express from "express";

import {
  notifyUsers,
  notifyUsersValidation,
} from "../controllers/DevController.js";
import { adminAuthMiddleware } from "../middlewares/authMiddleWare.js";

// Admin Only
const router = express.Router();
router.use(express.json());
router.use(adminAuthMiddleware);

// Routes

router.post("/notify", notifyUsersValidation, notifyUsers);

export default router;
