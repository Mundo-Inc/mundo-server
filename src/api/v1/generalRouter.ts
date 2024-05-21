import express from "express";

import {
  getVersionInfo,
  getVersionInfoValidation,
} from "../controllers/GeneralController.js";

const router = express.Router();
router.use(express.json());

router.get("/app-version/:version", getVersionInfoValidation, getVersionInfo);

export default router;
