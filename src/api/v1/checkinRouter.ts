import express from "express";

import {
  createCheckin,
  createCheckinValidation,
  deleteCheckin,
  deleteCheckinValidation,
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

router
  .route("/:id")
  .delete(authMiddleware, deleteCheckinValidation, deleteCheckin);

export default router;
