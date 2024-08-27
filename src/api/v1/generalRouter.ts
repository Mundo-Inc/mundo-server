import express from "express";

import { contact, contactValidation } from "../controllers/general/contact.js";
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
router.use(optionalAuthMiddleware);

router.get("/app-version/:version", getVersionInfoValidation, getVersionInfo);

router.post("/bug", reportBugValidation, reportBug);

router.post("/contact", contactValidation, contact);

export default router;
