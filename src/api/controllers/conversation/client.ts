import twilio from "twilio";

import { env } from "../../../env.js";

const client = new twilio.Twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

export default client;
