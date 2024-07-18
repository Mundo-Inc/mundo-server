import express from "express";

import {
  getVersionInfo,
  getVersionInfoValidation,
} from "../controllers/general/getVersionInfo.js";
import {
  reportBug,
  reportBugValidation,
} from "../controllers/general/reportBug.js";
import { optionalAuthMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();
router.use(express.json());

router.get("/app-version/:version", getVersionInfoValidation, getVersionInfo);

router.post("/bug", optionalAuthMiddleware, reportBugValidation, reportBug);

export default router;
