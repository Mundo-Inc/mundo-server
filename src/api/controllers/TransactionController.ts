import { NextFunction, Request, Response } from "express";
import { body, ValidationChain } from "express-validator";
import Stripe from "stripe";
import User, { IUser } from "../../models/User";
import { handleInputErrors } from "../../utilities/errorHandlers";

let stripe: Stripe;
if (process.env.NODE_ENV === "production") {
  stripe = new Stripe(process.env.STRIPE_SECRET_PROD!);
} else {
  stripe = new Stripe(process.env.STRIPE_SECRET_TEST!);
}

async function createStripeCustomer(user: IUser) {
  return stripe.customers.create({
    email: user.email.address,
  });
}

export const addOrUpdatePaymentMethodValidation: ValidationChain[] = [
  body("paymentMethodId").isString(),
];

export async function addOrUpdatePaymentMethod(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: authId } = req.user!;
    const { paymentMethodId } = req.body;

    const user = await User.findById(authId);

    if (!user) {
      return res.status(404).send("User not found.");
    }

    if (!user.stripe.paymentMethod) {
      // Assuming you have a Stripe Customer ID stored or you create a new Customer
      const customerId =
        user.stripe.customerId || (await createStripeCustomer(user)).id;
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });

      user.stripe.customerId = customerId;
    }

    // Update the user's payment method
    user.stripe.paymentMethod = paymentMethodId;
    await user.save();

    res
      .status(200)
      .json({ success: true, data: { paymentMethodId: paymentMethodId } });
  } catch (error) {
    next(error);
  }
}

export const addOrUpdatePayoutMethodValidation: ValidationChain[] = [
  body("bankAccountToken").isString(),
];

export async function addOrUpdatePayoutMethod(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: authId } = req.user!;

    const { bankAccountToken } = req.body; // Frontend should send a bank account token

    let user = (await User.findById(authId)) as IUser;

    if (!user) {
      return res.status(404).send("User not found.");
    }

    let accountId;
    // Check if the user already has a Stripe Connect account
    if (!user.stripe.connectAccountId) {
      const account = await stripe.accounts.create({
        type: "express", // or 'standard', depending on your needs
        email: user.email.address,
        capabilities: {
          transfers: { requested: true },
        },
      });
      accountId = account.id;
      // Save the Connect Account ID to the user's profile
      user.stripe.connectAccountId = accountId;
      await user.save();
    } else {
      accountId = user.stripe.connectAccountId;
    }

    // Add or update the bank account information for the Stripe Connect account
    const bankAccount = await stripe.accounts.createExternalAccount(accountId, {
      external_account: bankAccountToken,
    });

    res.send({
      success: true,
      message: "Payout method updated successfully.",
      bankAccount,
    });
  } catch (error) {
    next(error);
  }
}
