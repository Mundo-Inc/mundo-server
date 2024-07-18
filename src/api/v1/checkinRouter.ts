import express from "express";

import {
  createCheckIn,
  createCheckInValidation,
} from "../controllers/checkIn/createCheckIn.js";
import {
  deleteCheckIn,
  deleteCheckInValidation,
} from "../controllers/checkIn/deleteCheckIn.js";
import {
  getCheckIns,
  getCheckInsValidation,
} from "../controllers/checkIn/getCheckIns.js";
import { authMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();
router.use(express.json());
router.use(authMiddleware);

router
  .route("/")
  .get(getCheckInsValidation, getCheckIns)
  .post(createCheckInValidation, createCheckIn);

router.route("/:id").delete(deleteCheckInValidation, deleteCheckIn);

export default router;
