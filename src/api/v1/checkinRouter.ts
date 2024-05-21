import express from "express";

import {
  createCheckIn,
  createCheckInValidation,
  deleteCheckIn,
  deleteCheckInValidation,
  getCheckIns,
  getCheckInsValidation,
} from "../controllers/CheckInController.js";
import { authMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();
router.use(express.json());

router
  .route("/")
  .get(authMiddleware, getCheckInsValidation, getCheckIns)
  .post(authMiddleware, createCheckInValidation, createCheckIn);

router
  .route("/:id")
  .delete(authMiddleware, deleteCheckInValidation, deleteCheckIn);

export default router;
