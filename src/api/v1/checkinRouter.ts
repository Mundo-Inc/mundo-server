import express from "express";

import { authMiddleware } from "../middlewares/authMiddleWare";
import {
  createCheckin,
  createCheckinValidation,
  getCheckins,
  getCheckinsValidation,
} from "../controllers/CheckinController";

const router = express.Router();
router.use(express.json());

router
  .route("/")
  .get(authMiddleware, getCheckinsValidation, getCheckins)
  .post(authMiddleware, createCheckinValidation, createCheckin);

export default router;
