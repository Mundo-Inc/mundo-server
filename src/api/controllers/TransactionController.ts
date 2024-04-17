// @ts-nocheck

import type { NextFunction, Request, Response } from "express";
import { body, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import Stripe from "stripe";

import Transaction from "../../models/Transaction";
import User, { type IUser } from "../../models/User";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";

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
    // Handle input errors first (this function needs to be defined by you or use any existing validation middleware)
    handleInputErrors(req);

    // Extract the authenticated user's ID from the request, assuming authentication middleware sets it
    const { id: authId } = req.user!;
    let user = await User.findById(authId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let accountId = user.stripe.connectAccountId;

    // Check if the user already has a Stripe Connect account
    if (!accountId) {
      // Create a new Custom Stripe Connect account
      const account = await stripe.accounts.create({
        type: "custom",
        email: user.email.address,
        requested_capabilities: ["transfers"],
        business_type: "individual",
        individual: {
          email: user.email.address,
          first_name: user.name.split(" ")[0],
          last_name: user.name.split(" ")[1] || "",
        },
      });
      accountId = account.id;

      // Save the Connect Account ID to the user's profile
      user.stripe.connectAccountId = accountId;
      await user.save();
    }

    // Assume the bank account token is already created and passed in
    const { bankAccountToken } = req.body;

    if (!bankAccountToken) {
      return res
        .status(400)
        .json({ message: "Bank account token is required" });
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
    console.error("Error in addOrUpdatePayoutMethod:", error);
    next(error); // Passes errors to Express error handling middleware
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
      throw createError("Sender or receiver not found", StatusCodes.NOT_FOUND);
    }

    if (!sender.stripe.paymentMethod || !sender.stripe.customerId) {
      throw createError(
        "No payment method found. Please add a payment method before sending a gift.",
        StatusCodes.BAD_REQUEST
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

export const withdrawValidation: ValidationChain[] = [
  body("amount").isNumeric(),
];

export async function withdraw(
  req: Request,
  res: Response,
  next: NextFunction
) {
  handleInputErrors(req);
  const { id: authId } = req.user!;
  const { amount } = req.body;

  try {
    const user = await User.findById(authId);
    if (!user) {
      throw createError("User not found", StatusCodes.BAD_REQUEST);
    }

    // Ensure the user's balance is sufficient
    if (user.balance < amount) {
      throw createError("Insufficient Balance", StatusCodes.BAD_REQUEST);
    }

    // Check if the user has a Stripe Connect account with a bank account attached
    if (!user.stripe.connectAccountId) {
      throw createError(
        "Stripe Connect account not configured",
        StatusCodes.BAD_REQUEST
      );
    }

    // Retrieve the Stripe Connect account to confirm that it has an external account set up
    try {
      const account = await stripe.accounts.retrieve(
        user.stripe.connectAccountId
      );

      if (account.requirements.currently_due.length > 0) {
        console.log(
          "Requirements currently due:",
          account.requirements.currently_due
        );
      } else if (account.requirements.eventually_due.length > 0) {
        console.log(
          "Requirements eventually due:",
          account.requirements.eventually_due
        );
      } else {
        console.log(
          "No requirements due. Other issues may be preventing payouts."
        );
      }
    } catch (error) {
      console.error("Error retrieving Stripe account details:", error);
    }

    // Create a payout to the default external account
    const payout = await stripe.payouts.create(
      {
        amount: Math.round(amount * 100), // Convert to cents
        currency: "usd",
      },
      {
        stripeAccount: user.stripe.connectAccountId, // Specify the connected Stripe account to payout from
      }
    );

    // Deduct the payout amount from the user's balance
    user.balance -= amount;
    await user.save();

    // Log the transaction in your database
    const transaction = new Transaction({
      amount: amount,
      serviceFee: 0, // Assuming no service fee for withdrawal; adjust if needed
      totalAmount: amount,
      sender: authId, // Assuming the withdrawal deducts from the user's own balance
      receiver: null, // There is no receiver in a withdrawal
      paymentIntentId: payout.id, // Use the payout ID for the transaction record
    });
    await transaction.save();

    res.json({
      success: true,
      data: { payout },
    });
  } catch (error) {
    next(error);
  }
}

export const updateAccountInformationValidation: ValidationChain[] = [];

export async function updateAccountInformation(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: authId } = req.user!;
    let user = await User.findById(authId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const { token, individual, business_profile, tos_acceptance } = req.body;

    const clientIp =
      req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    const tosTimestamp = Math.floor(Date.now() / 1000);

    // The tos_acceptance should be provided directly, not nested within 'individual'
    const updatedIndividual = { ...individual };
    delete updatedIndividual.tos_acceptance; // Remove tos_acceptance from individual if it's there

    try {
      const accountUpdate = await stripe.accounts.update(
        user.stripe.connectAccountId,
        {
          external_account: token, // Assuming 'token' is a bank account token (btok_*)
          individual: updatedIndividual,
          business_profile: { url: "www.phantomphood.ai" },
          tos_acceptance: {
            date: tosTimestamp,
            ip: clientIp,
          },
        }
      );

      res.json({ success: true, accountUpdate });
    } catch (error) {
      console.log(error);
      res.status(500).json({ success: false, error: error.message });
    }
  } catch (error) {
    console.error("Error in updateAccountInformation:", error);
    next(error);
  }
}
