import type { NextFunction, Request, Response } from "express";
import { body, param, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import { Types } from "mongoose";
import Stripe from "stripe";

import Transaction from "../../models/Transaction";
import User, { type IUser } from "../../models/User";
import Withdrawal from "../../models/Withdrawal";
import { dStrings, dynamicMessage } from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { roundUpToTwoDecimals } from "../../utilities/numbers";
import { ensureNonEmptyString } from "../../utilities/requireValue";
import TransactionProjection, {
  type TransactionProjectionPublic,
} from "../dto/transaction";
import UserProjection, { type UserProjectionEssentials } from "../dto/user";
import { sendAttributtedMessage } from "./ConversationController";

const SERVICE_FEE_RATIO = 0.05;

const stripeSecret =
  process.env.NODE_ENV === "production"
    ? process.env.STRIPE_SECRET_PROD
    : process.env.STRIPE_SECRET_TEST;

if (!stripeSecret) {
  throw new Error("Stripe secret is not defined");
}

const stripe = new Stripe(stripeSecret);

async function createStripeCustomer(user: IUser) {
  return stripe.customers.create({
    email: user.email.address,
  });
}

export async function getSecret(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const user = await User.findById(authUser._id).orFail(
      createError(
        dynamicMessage(dStrings.notFound, "User"),
        StatusCodes.NOT_FOUND
      )
    );

    const customerId =
      user.stripe.customerId || (await createStripeCustomer(user)).id;
    user.stripe.customerId = customerId;

    await user.save();

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: process.env.STRIPE_API_VERSION! }
    );

    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        customer: customerId,
        ephemeralKeySecret: ephemeralKey.secret,
      },
    });
  } catch (error) {
    next(error);
  }
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

    const authUser = req.user!;

    const { paymentMethodId } = req.body;

    const user = await User.findById(authUser._id).orFail(
      createError(
        dynamicMessage(dStrings.notFound, "User"),
        StatusCodes.NOT_FOUND
      )
    );

    if (!user.stripe.defaultPaymentMethodId) {
      // Assuming you have a Stripe Customer ID stored or you create a new Customer
      const customerId =
        user.stripe.customerId || (await createStripeCustomer(user)).id;
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });

      user.stripe.customerId = customerId;
    }

    // Update the user's payment method
    user.stripe.defaultPaymentMethodId = paymentMethodId;
    await user.save();

    res
      .status(StatusCodes.OK)
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

    const authUser = req.user!;

    const user = await User.findById(authUser._id).orFail(
      createError(
        dynamicMessage(dStrings.notFound, "User"),
        StatusCodes.NOT_FOUND
      )
    );

    if (!user.stripe.defaultPaymentMethodId) {
      throw createError("No payment method found", StatusCodes.NOT_FOUND);
    }

    // Retrieve the payment method details from Stripe
    const paymentMethod = await stripe.paymentMethods.retrieve(
      user.stripe.defaultPaymentMethodId
    );

    // Extract relevant details to return
    const paymentMethodDetails = {
      type: paymentMethod.type,
      last4: paymentMethod.card?.last4, //TODO: we assumed that it's a card; adjust accordingly for other types
      brand: paymentMethod.card?.brand,
      exp_month: paymentMethod.card?.exp_month,
      exp_year: paymentMethod.card?.exp_year,
    };

    res.status(StatusCodes.OK).json({
      success: true,
      data: paymentMethodDetails,
    });
  } catch (error) {
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

    const authUser = req.user!;

    const user = await User.findById(authUser._id).orFail(
      createError(
        dynamicMessage(dStrings.notFound, "User"),
        StatusCodes.NOT_FOUND
      )
    );

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

    if (
      !(
        account.requirements &&
        account.requirements.currently_due &&
        account.requirements.eventually_due
      )
    ) {
      throw createError(
        "Error retrieving account requirements",
        StatusCodes.INTERNAL_SERVER_ERROR
      );
    }

    const isEligible =
      account.requirements.currently_due.length === 0 &&
      account.requirements.eventually_due.length === 0;

    // Check if there are any requirements pending that prevent payouts
    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        eligible: isEligible,
        message: isEligible
          ? "No additional setup required. Account is fully set up for payouts."
          : "Please complete the required account setup.",
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function onboarding(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    let user = await User.findById(authUser._id).orFail(
      createError(
        dynamicMessage(dStrings.notFound, "User"),
        StatusCodes.NOT_FOUND
      )
    );

    const accountId = user.stripe.connectAccountId;

    if (!accountId) {
      throw createError(
        "Payout-method is not set up for this account, try setting that up first before onboarding",
        StatusCodes.BAD_REQUEST
      );
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: "https://www.phantomphood.ai", // URL to redirect if the link is no longer valid
      return_url: "https://www.phantomphood.ai", // URL to redirect after the user completes the onboarding
      type: "account_onboarding",
    });

    res
      .status(StatusCodes.OK)
      .json({ success: true, data: { url: accountLink.url } });
  } catch (error) {
    next(error);
  }
}

export const sendGiftValidation: ValidationChain[] = [
  body("amount").isNumeric().toFloat(),
  body("recipient").optional().isMongoId(), // TODO: remove optional
  body("receiverId").optional().isMongoId(), // TODO: remove this
  body("paymentMethodId").isString(),
  body("message").optional().isString(),
];

export async function sendGift(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const amount: number = Math.round(req.body.amount * 100) / 100; // Ensure amount is rounded to 2 decimal places
    const paymentMethodId: string = req.body.paymentMethodId;
    console.log(paymentMethodId);
    const message: string = req.body.message || "";

    const recipientId = req.body.recipient
      ? new Types.ObjectId(req.body.recipient as string)
      : req.body.receiverId
      ? new Types.ObjectId(req.body.receiverId as string)
      : null;

    if (!recipientId) {
      throw createError("Recipient ID is required", StatusCodes.BAD_REQUEST);
    }

    const [sender, recipient] = await Promise.all([
      User.findById(authUser._id).orFail(
        createError(
          dynamicMessage(dStrings.notFound, "User (sender)"),
          StatusCodes.NOT_FOUND
        )
      ),
      User.findById(recipientId).orFail(
        createError(
          dynamicMessage(dStrings.notFound, "User (recipient)"),
          StatusCodes.NOT_FOUND
        )
      ),
    ]);

    const customerId = ensureNonEmptyString(
      sender.stripe.customerId,
      createError(
        "No customerID found. Please contact support.",
        StatusCodes.BAD_REQUEST
      )
    );

    const recipientAccountId = ensureNonEmptyString(
      recipient.stripe.connectAccountId,
      createError(
        "Recipient does not have a Stripe Connect account",
        StatusCodes.BAD_REQUEST
      )
    );

    const serviceFee = roundUpToTwoDecimals(amount * SERVICE_FEE_RATIO); // Round up the service fee
    const totalAmount = (amount * 100 + serviceFee * 100) / 100;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount * 100, // Amount in cents
      currency: "usd",
      payment_method: paymentMethodId,
      customer: customerId, // Include the customer ID here
      confirm: true, // Automatically confirm the payment
      description: `Gift transaction from ${sender._id} to ${recipient._id}`,
      transfer_data: {
        destination: recipientAccountId,
      },
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never",
      },
    });

    // Update recipient's balance
    recipient.stripe.balance += amount;
    await recipient.save();

    const transaction = await Transaction.create({
      amount,
      serviceFee,
      totalAmount,
      sender: sender._id,
      recipient: recipient._id,
      paymentIntentId: paymentIntent.id,
      message: message,
    });

    // Send message to recipient
    sendAttributtedMessage(authUser._id, recipientId, message, {
      action: "gift",
      transactionId: transaction._id.toString(),
    });

    res.status(StatusCodes.OK).send({
      success: true,
      data: transaction,
    });
  } catch (error) {
    next(error);
  }
}

export const withdrawValidation: ValidationChain[] = [
  body("amount").isNumeric().toFloat(),
];

export async function withdraw(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const amount: number = Math.round(req.body.amount * 100) / 100; // Ensure amount is rounded to 2 decimal places

    const user = await User.findById(authUser._id).orFail(
      createError(
        dynamicMessage(dStrings.notFound, "User"),
        StatusCodes.NOT_FOUND
      )
    );

    // Ensure the user's balance is sufficient
    if (user.stripe.balance < amount) {
      throw createError("Insufficient Balance", StatusCodes.BAD_REQUEST);
    }

    // Check if the user has a Stripe Connect account with a bank account attached
    const connectAccountId = ensureNonEmptyString(
      user.stripe.connectAccountId,
      createError(
        "Stripe Connect account not configured",
        StatusCodes.BAD_REQUEST
      )
    );

    // Retrieve the Stripe Connect account to confirm that it has an external account set up
    try {
      const account = await stripe.accounts.retrieve(connectAccountId);

      if (
        account.requirements &&
        account.requirements.currently_due &&
        account.requirements.eventually_due &&
        (account.requirements.currently_due.length > 0 ||
          account.requirements.eventually_due.length > 0)
      ) {
        throw createError(
          "Please update your account information to be eligible for the withdrawal",
          StatusCodes.BAD_REQUEST
        );
      }
      // Transfer funds to the Connect account, assuming the platform has enough balance
      await stripe.transfers.create({
        amount: amount * 100, // Amount in cents
        currency: "usd",
        destination: connectAccountId,
      });
    } catch (error) {
      throw createError(
        "Error retrieving Stripe account details:",
        StatusCodes.INTERNAL_SERVER_ERROR
      );
    }

    // Create a payout to the default external account
    const payout = await stripe.payouts.create(
      {
        amount: amount * 100, // Convert to cents
        currency: "usd",
      },
      {
        stripeAccount: connectAccountId, // Specify the connected Stripe account to payout from
      }
    );

    // Deduct the payout amount from the user's balance
    user.stripe.balance -= amount;
    await user.save();

    await Withdrawal.create({
      user: authUser._id,
      amount: amount,
      payoutId: payout.id,
    });

    res.status(StatusCodes.OK).json({
      success: true,
      data: payout,
    });
  } catch (error) {
    next(error);
  }
}

export const getTransactionValidation: ValidationChain[] = [
  param("id").isMongoId(),
];

export async function getTransaction(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const id = new Types.ObjectId(req.params.id);

    const transaction = await Transaction.findById(id)
      .select<TransactionProjectionPublic>(TransactionProjection.public)
      .orFail(
        createError(
          dynamicMessage(dStrings.notFound, "Transaction"),
          StatusCodes.NOT_FOUND
        )
      )
      .populate<{
        sender: UserProjectionEssentials;
      }>("sender", UserProjection.essentials)
      .populate<{
        recipient: UserProjectionEssentials;
      }>("recipient", UserProjection.essentials)
      .lean();

    if (
      !authUser._id.equals(transaction.sender._id) &&
      !authUser._id.equals(transaction.recipient._id)
    ) {
      throw createError(
        "You are not authorized to view this transaction",
        StatusCodes.UNAUTHORIZED
      );
    }

    res.status(StatusCodes.OK).json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    next(error);
  }
}
