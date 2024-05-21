import express from "express";

import {
  createFlag,
  createFlagValidation,
} from "../controllers/FlagController.js";
import { authMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();
router.use(express.json());
router.use(authMiddleware);

router.route("/flag").post(createFlagValidation, createFlag);

export default router;
