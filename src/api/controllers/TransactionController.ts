import { NextFunction, Request, Response } from "express";
import { body, ValidationChain } from "express-validator";
import Stripe from "stripe";
import User, { IUser } from "../../models/User";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import Transaction from "../../models/Transaction";
import { BAD_REQUEST, NOT_FOUND } from "http-status-codes";

const SERVICE_FEE_RATIO = 0.05;

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

export const getPaymentMethodValidation: ValidationChain[] = [];

export async function getPaymentMethod(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const { id: authId } = req.user!;

    const user = await User.findById(authId);
    if (!user || !user.stripe.paymentMethod) {
      return res
        .status(404)
        .json({ success: false, message: "No payment method found." });
    }

    // Retrieve the payment method details from Stripe
    const paymentMethod = await stripe.paymentMethods.retrieve(
      user.stripe.paymentMethod
    );

    // Extract relevant details to return
    const paymentMethodDetails = {
      type: paymentMethod.type,
      last4: paymentMethod.card?.last4, // Assuming it's a card; adjust accordingly for other types
      brand: paymentMethod.card?.brand,
      exp_month: paymentMethod.card?.exp_month,
      exp_year: paymentMethod.card?.exp_year,
    };

    res.json({
      success: true,
      data: { paymentMethod: paymentMethodDetails },
    });
  } catch (error) {
    console.error("Failed to retrieve payment method:", error);
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

export const sendGiftValidation: ValidationChain[] = [
  body("amount").isNumeric(),
  body("receiverId").isMongoId(),
];

export async function sendGift(
  req: Request,
  res: Response,
  next: NextFunction
) {
  handleInputErrors(req);

  const { id: authId } = req.user!;
  const { amount, receiverId } = req.body;

  try {
    const sender = await User.findById(authId);
    const receiver = await User.findById(receiverId);

    if (!sender || !receiver) {
      throw createError("Sender or receiver not found", NOT_FOUND);
    }

    if (!sender.stripe.paymentMethod || !sender.stripe.customerId) {
      throw createError(
        "No payment method found. Please add a payment method before sending a gift.",
        BAD_REQUEST
      );
    }

    const serviceFee = amount * SERVICE_FEE_RATIO; // Assuming a 5% service fee
    const totalAmount = amount + serviceFee;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100), // convert amount to cents
      currency: "usd",
      payment_method: sender.stripe.paymentMethod,
      customer: sender.stripe.customerId, // Include the customer ID here
      confirm: true, // Automatically confirm the payment
      description: `Gift transaction from ${sender._id} to ${receiver._id}`,
      transfer_data: {
        destination: receiver.stripe.accountId,
      },
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never",
      },
    });

    // Update receiver's balance
    receiver.stripe.balance += amount; // Ensure this is persisted in your database model
    await receiver.save();

    // Log transaction in your database
    const transaction = new Transaction({
      amount,
      serviceFee,
      totalAmount,
      sender: sender._id,
      receiver: receiver._id,
      paymentIntentId: paymentIntent.id,
    });
    await transaction.save();

    res.send({
      success: true,
      data: { transaction },
    });
  } catch (error) {
    console.error("Error during transaction:", error);
    next(error);
  }
}

export const payoutValidation: ValidationChain[] = [body("amount").isNumeric()];

export async function payout(req: Request, res: Response, next: NextFunction) {
  handleInputErrors(req);
  const { id: authId } = req.user!;
  const { amount } = req.body;

  try {
    const user = await User.findById(authId);
    // Check if the user has a connected bank account or debit card

    if (user.balance < amount) {
      throw createError("Insufficient Balance", BAD_REQUEST);
    }

    if (!user.stripe.payoutMethod) {
      throw createError("Payout method is not configured", BAD_REQUEST);
    }

    const payout = await stripe.payouts.create(
      {
        amount: Math.round(amount * 100), //  to cents
        currency: "usd",
        destination: user.stripe.payoutMethod,
      },
      {
        stripeAccount: user.stripe.connectAccountId,
      }
    );

    // Deduct the payout amount from the user's balance
    user.balance -= amount;
    await user.save();

    res.json({
      success: true,
      data: { payout },
    });
  } catch (error) {
    next(error);
  }
}
