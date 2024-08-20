import { Schema } from "mongoose";
import { z } from "zod";

export const zUserStripeSchema = z.object({
  /**
   * Stripe Connect Account ID
   */
  connectAccountId: z.string().optional(),
  /**
   * Stripe Customer ID
   */
  customerId: z.string().optional(),
  /**
   * Default Stripe Payment Method ID
   */
  defaultPaymentMethodId: z.string().optional(),
  /**
   * Default Stripe Payout Method ID
   */
  defaultPayoutMethodId: z.string().optional(),
  /**
   * User's balance in cents
   */
  balance: z.number(),
});

export type IUserStripe = z.infer<typeof zUserStripeSchema>;

export const userStripeSchema = new Schema<IUserStripe>(
  {
    connectAccountId: {
      type: String,
    },
    customerId: {
      type: String,
    },
    defaultPaymentMethodId: {
      type: String,
    },
    defaultPayoutMethodId: {
      type: String,
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  { _id: false },
);
