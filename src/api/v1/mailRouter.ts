import express from "express";

import {
  resetPassword,
  resetPasswordValidation,
  sendEmailVerification,
  verifyEmail,
  verifyEmailValidation,
} from "../controllers/MailController";
import { authMiddleware } from "../middlewares/authMiddleWare";

const router = express.Router();
router.use(express.json());

router.post("/reset-password", resetPasswordValidation, resetPassword);

router
  .route("/verify")
  .post(authMiddleware, sendEmailVerification)
  .get(authMiddleware, verifyEmailValidation, verifyEmail);

export default router;
