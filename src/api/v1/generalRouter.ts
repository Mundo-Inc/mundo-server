import express from "express";

import {
  getVersionInfo,
  getVersionInfoValidation,
  reportBug,
  reportBugValidation,
} from "../controllers/GeneralController.js";
import { optionalAuthMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();
router.use(express.json());

router.get("/app-version/:version", getVersionInfoValidation, getVersionInfo);

router.post("/bug", optionalAuthMiddleware, reportBugValidation, reportBug);

export default router;
