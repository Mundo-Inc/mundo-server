import express from "express";

import {
  getCategories,
  getCategoriesValidation,
} from "../controllers/GeneralController";

const router = express.Router();
router.use(express.json());

router.get("/categories", getCategoriesValidation, getCategories);

export default router;
