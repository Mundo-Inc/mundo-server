import express from "express";
import { authMiddleware } from "../middlewares/authMiddleWare";
import {
  addOrUpdatePaymentMethod,
  addOrUpdatePaymentMethodValidation,
  addOrUpdatePayoutMethod,
  addOrUpdatePayoutMethodValidation,
  getPaymentMethod,
  sendGift,
  sendGiftValidation,
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
  .post(
    authMiddleware,
    addOrUpdatePayoutMethodValidation,
    addOrUpdatePayoutMethod
  );

router.route("/gift").post(authMiddleware, sendGiftValidation, sendGift);
export default router;
