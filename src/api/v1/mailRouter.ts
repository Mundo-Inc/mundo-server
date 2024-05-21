import express from "express";

import {
  sendEmailVerification,
  verifyEmail,
  verifyEmailValidation,
} from "../controllers/MailController.js";
import { authMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();
router.use(express.json());

router
  .route("/verify")
  .post(authMiddleware, sendEmailVerification)
  .get(authMiddleware, verifyEmailValidation, verifyEmail);

export default router;
