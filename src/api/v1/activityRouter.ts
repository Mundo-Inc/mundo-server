import express from "express";

import {
  createFlag,
  createFlagValidation,
} from "../controllers/FlagController";
import { authMiddleware } from "../middlewares/authMiddleWare";

const router = express.Router();
router.use(express.json());
router.use(authMiddleware);

router.route("/flag").post(createFlagValidation, createFlag);

export default router;
