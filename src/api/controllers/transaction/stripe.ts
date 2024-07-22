import Stripe from "stripe";

import { env } from "../../../env.js";

const stripe = new Stripe(env.STRIPE_SECRET_KEY);

export default stripe;
