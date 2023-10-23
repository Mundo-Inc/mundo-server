import express from "express";

import {
  getFlags,
  getFlagsValidation,
  getUsers,
  getUsersValidation,
} from "../controllers/AdminController";
import { adminAuthMiddleware } from "../middlewares/authMiddleWare";

// Admin Only
const router = express.Router();
router.use(express.json());
router.use(adminAuthMiddleware);

router.route("/users").get(getUsersValidation, getUsers);

router.route("/flags").get(getFlagsValidation, getFlags);

export default router;
