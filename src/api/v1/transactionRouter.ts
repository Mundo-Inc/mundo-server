import express from "express";

import { addOrUpdatePayoutMethod } from "../controllers/transaction/addOrUpdatePayoutMethod.js";
import { getStripeSecret } from "../controllers/transaction/getStripeSecret.js";
import {
  getTransaction,
  getTransactionValidation,
} from "../controllers/transaction/getTransaction.js";
import {
  sendGift,
  sendGiftValidation,
} from "../controllers/transaction/sendGift.js";
import { stripeOnboarding } from "../controllers/transaction/stripeOnboarding.js";
import {
  withdraw,
  withdrawValidation,
} from "../controllers/transaction/withdraw.js";
import { authMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();
router.use(express.json());
router.use(authMiddleware);

// router
//   .route("/payment-method")
//   .get(getPaymentMethod)
//   .post(addOrUpdatePaymentMethodValidation, addOrUpdatePaymentMethod);

router
  .route("/payout-method")
  .post(stripeOnboarding)
  .get(addOrUpdatePayoutMethod);

router.post("/withdraw", withdrawValidation, withdraw);

router.post("/gift", sendGiftValidation, sendGift);

router.get("/customer", getStripeSecret);

router.get("/:transactionId", getTransactionValidation, getTransaction);

export default router;
