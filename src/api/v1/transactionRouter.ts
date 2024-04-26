import express from "express";

import {
  addOrUpdatePaymentMethod,
  addOrUpdatePaymentMethodValidation,
  addOrUpdatePayoutMethod,
  getPaymentMethod,
  onboarding,
  sendGift,
  sendGiftValidation,
  withdraw,
  withdrawValidation,
} from "../controllers/TransactionController";
import { authMiddleware } from "../middlewares/authMiddleWare";

const router = express.Router();
router.use(express.json());
router.use(authMiddleware);

router
  .route("/payment-method")
  .get(getPaymentMethod)
  .post(addOrUpdatePaymentMethodValidation, addOrUpdatePaymentMethod);

router.route("/payout-method").post(onboarding).get(addOrUpdatePayoutMethod);

router.route("/withdraw").post(withdrawValidation, withdraw);

router.route("/gift").post(sendGiftValidation, sendGift);

// post /customer -> ephemeralKeySecret +

// create-setup-intent -> setup intent

export default router;
