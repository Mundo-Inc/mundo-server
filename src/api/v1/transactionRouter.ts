import express from "express";

import {
  addOrUpdatePayoutMethod,
  getSecret,
  getTransaction,
  getTransactionValidation,
  onboarding,
  sendGift,
  sendGiftValidation,
  withdraw,
  withdrawValidation,
} from "../controllers/TransactionController.js";
import { authMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();
router.use(express.json());
router.use(authMiddleware);

// router
//   .route("/payment-method")
//   .get(getPaymentMethod)
//   .post(addOrUpdatePaymentMethodValidation, addOrUpdatePaymentMethod);

router.route("/payout-method").post(onboarding).get(addOrUpdatePayoutMethod);

router.route("/withdraw").post(withdrawValidation, withdraw);

router.route("/gift").post(sendGiftValidation, sendGift);

router.route("/customer").get(getSecret);

router.route("/:id").get(getTransactionValidation, getTransaction);

export default router;
