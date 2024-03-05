import express from "express";

import {
  createCheckin,
  createCheckinValidation,
  getCheckins,
  getCheckinsValidation,
} from "../controllers/CheckinController";
import { authMiddleware } from "../middlewares/authMiddleWare";

const router = express.Router();
router.use(express.json());

router
  .route("/")
  .get(authMiddleware, getCheckinsValidation, getCheckins)
  .post(authMiddleware, createCheckinValidation, createCheckin);

export default router;
