import express from "express";

import {
  getCategories,
  getCategoriesValidation,
  getVersionInfo,
  getVersionInfoValidation,
} from "../controllers/GeneralController";

const router = express.Router();
router.use(express.json());

router.get("/categories", getCategoriesValidation, getCategories);

router.get("/app-version/:version", getVersionInfoValidation, getVersionInfo);

export default router;
