import express from "express";
import { authMiddleware } from "../middlewares/authMiddleWare";
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

const router = express.Router();
router.use(express.json());

router
  .route("/payment-method")
  .get(authMiddleware, getPaymentMethod)
  .post(
    authMiddleware,
    addOrUpdatePaymentMethodValidation,
    addOrUpdatePaymentMethod
  );

router
  .route("/payout-method")
  .put(authMiddleware, onboarding)
  .post(authMiddleware, addOrUpdatePayoutMethod);

router.route("/withdraw").post(authMiddleware, withdrawValidation, withdraw);

router.route("/gift").post(authMiddleware, sendGiftValidation, sendGift);

export default router;
