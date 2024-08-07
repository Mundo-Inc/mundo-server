import twilio from "twilio";

import { env } from "../../env.js";
import CompanyPhoneNumber from "../../models/CompanyPhoneNumber.js";
import logger from "./logger/index.js";

export default class SmsService {
  private static instance: SmsService;

  private twilioClient: twilio.Twilio;

  private constructor() {
    this.twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }

  public static getInstance(): SmsService {
    if (!SmsService.instance) {
      SmsService.instance = new SmsService();
    }
    return SmsService.instance;
  }

  /**
   * Sends an SMS message to the specified phone number
   * @param to Phone number to send the message to
   * @param message Message to send
   *
   * @throws {Error} If no phone number is found
   */
  public async send(to: string, message: string) {
    const phoneNumber = await CompanyPhoneNumber.findOne()
      .sort({ messagesSent: -1 })
      .orFail(new Error("No phone number found"));

    await this.twilioClient.messages.create(
      {
        body: message,
        from: phoneNumber.number,
        to: to,
      },
      async (err, item) => {
        if (err) {
          logger.error("Error sending SMS", err);
        } else if (item) {
          logger.verbose(`SMS sent successfully\nContent: ${message}`);

          phoneNumber.messagesSent++;
          phoneNumber.lastMessageDate = new Date();
          await phoneNumber.save();
        }
      },
    );
  }
}
