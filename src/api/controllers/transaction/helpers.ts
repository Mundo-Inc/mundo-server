import stripe from "./stripe.js";

import type { IUser } from "@/models/User.js";

export async function createStripeCustomer(user: IUser) {
  return stripe.customers.create({
    email: user.email.address,
  });
}
