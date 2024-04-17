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
  updateAccountInformation,
  updateAccountInformationValidation,
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
  .post(
    authMiddleware,
    addOrUpdatePayoutMethodValidation,
    addOrUpdatePayoutMethod
  );

router.route("/withdraw").post(authMiddleware, withdrawValidation, withdraw);

router.route("/gift").post(authMiddleware, sendGiftValidation, sendGift);

router
  .route("/accountInformation")
  .post(
    authMiddleware,
    updateAccountInformationValidation,
    updateAccountInformation
  );

export default router;
