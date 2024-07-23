import {
  AccountApi,
  AccountApiApiKeys,
  SendSmtpEmail,
  SendSmtpEmailToInner,
  TransactionalEmailsApi,
  TransactionalEmailsApiApiKeys,
} from "@getbrevo/brevo";
import { readFileSync } from "fs";
import Handlebars from "handlebars";
import path from "path";

import { env } from "../../env.js";
import logger from "./logger/index.js";

interface EmailSender {
  email: string;
  name: string;
}

export class BrevoService {
  private accountInstance: AccountApi;
  private apiInstance: TransactionalEmailsApi;

  constructor() {
    this.accountInstance = new AccountApi();
    this.accountInstance.setApiKey(AccountApiApiKeys.apiKey, env.BREVO_API_KEY);

    this.apiInstance = new TransactionalEmailsApi();
    this.apiInstance.setApiKey(
      TransactionalEmailsApiApiKeys.apiKey,
      env.BREVO_API_KEY,
    );

    this.accountInstance
      .getAccount()
      .then((_) => logger.verbose("Brevo Connected"))
      .catch((err) => logger.error("Brevo Connection Error", err));
  }

  private compileTemplateToHtml(templatePath: string, replacements: object) {
    const html = readFileSync(
      path.join(process.cwd(), "src/email-templates", templatePath),
      { encoding: "utf-8" },
    );
    const template = Handlebars.compile(html);
    const compiledHtml = template(replacements);
    return compiledHtml;
  }

  public async sendEmail(msg: SendSmtpEmail) {
    try {
      return await this.apiInstance.sendTransacEmail(msg);
    } catch (err) {
      logger.error(`sendEmail error: ${JSON.stringify(err)}`);
    }
  }

  public async sendTemplateEmail(
    receivers: SendSmtpEmailToInner[],
    subject: string,
    sender: EmailSender,
    templatePath: string,
    replacements: object,
  ) {
    const compiledHtml = this.compileTemplateToHtml(templatePath, replacements);
    const res = await this.sendEmail({
      htmlContent: compiledHtml,
      to: receivers,
      subject,
      sender: sender,
    });
    return res;
  }
}
