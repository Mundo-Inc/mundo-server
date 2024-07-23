import twilio from "twilio";

import { env } from "../../env.js";

export const twilio_client = twilio(
  env.TWILIO_ACCOUNT_SID,
  env.TWILIO_AUTH_TOKEN,
);
