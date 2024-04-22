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
      last4: paymentMethod.card?.last4, //TODO: we assumed that it's a card; adjust accordingly for other types
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

export async function addOrUpdatePayoutMethod(
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

    let accountId = user.stripe.connectAccountId;

    if (!accountId) {
      // Create a new Custom Stripe Connect account
      const account = await stripe.accounts.create({
        type: "custom",
        email: user.email.address,
        business_type: "individual",
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
      accountId = account.id;
      user.stripe.connectAccountId = accountId;
      await user.save();
    }

    // Retrieve the account to check for required information
    const account: Stripe.Account | null = await stripe.accounts.retrieve(
      accountId
    );

    // Check if there are any requirements pending that prevent payouts
    if (
      account.requirements &&
      account.requirements.currently_due &&
      account.requirements.eventually_due &&
      (account.requirements.currently_due.length > 0 ||
        account.requirements.eventually_due.length > 0)
    ) {
      // Generate an account link for onboarding or updating information
      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: "https://www.phantomphood.ai",
        return_url: "https://www.phantomphood.ai",
        type: "account_onboarding",
      });

      // Send the user to complete their account setup
      return res.status(200).json({
        success: true,
        eligible: false,
        message: "Please complete the required account setup.",
        url: accountLink.url,
      });
    } else {
      return res.status(200).json({
        success: true,
        eligible: true,
        message:
          "No additional setup required. Account is fully set up for payouts.",
      });
    }
  } catch (error) {
    console.error("Error in addOrUpdatePayoutMethod:", error);
    next(error); // Passes errors to Express error handling middleware
  }
}

export async function onboarding(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: authId } = req.user!;
    let user: IUser | null = await User.findById(authId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const accountId = user.stripe.connectAccountId;

    if (!accountId) {
      throw createError(
        "Payout-method is not set up for this account, try setting that up first before onboarding",
        400
      );
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: "https://www.phantomphood.ai", // URL to redirect if the link is no longer valid
      return_url: "https://www.phantomphood.ai", // URL to redirect after the user completes the onboarding
      type: "account_onboarding",
    });
    res.status(200).json({ success: true, data: { url: accountLink.url } });
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
      data: transaction,
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
      const account: Stripe.Account | null = await stripe.accounts.retrieve(
        user.stripe.connectAccountId
      );

      if (
        account.requirements &&
        account.requirements.currently_due &&
        account.requirements.eventually_due &&
        (account.requirements.currently_due.length > 0 ||
          account.requirements.eventually_due.length > 0)
      ) {
        throw createError(
          "Please update your account information to be eligible for the withdrawal",
          400
        );
      }
      // Transfer funds to the Connect account, assuming the platform has enough balance
      await stripe.transfers.create({
        amount: Math.round(amount * 100), // Amount in cents
        currency: "usd",
        destination: user.stripe.connectAccountId,
      });
    } catch (error) {
      throw createError("Error retrieving Stripe account details:", 500);
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
      receiver: user._id, // There is no receiver in a withdrawal
      paymentIntentId: payout.id, // Use the payout ID for the transaction record
    });
    await transaction.save();

    res.json({
      success: true,
      data: payout,
    });
  } catch (error) {
    next(error);
  }
}
