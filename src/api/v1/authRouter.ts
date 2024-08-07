import express from "express";

import { firebaseSync } from "../controllers/auth/firebaseSync.js";
import {
  requestPhoneVerification,
  requestPhoneVerificationValidation,
} from "../controllers/auth/requestPhoneVerification.js";
import {
  verifyPhone,
  verifyPhoneValidation,
} from "../controllers/auth/verifyPhone.js";
import { authMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();
router.use(express.json());

router.post("/firebaseSync", firebaseSync);

router
  .route("/verify-phone")
  .patch(authMiddleware, verifyPhoneValidation, verifyPhone)
  .post(requestPhoneVerificationValidation, requestPhoneVerification);

export default router;
