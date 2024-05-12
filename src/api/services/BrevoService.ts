import {
  AccountApi,
  AccountApiApiKeys,
  SendSmtpEmail,
  SendSmtpEmailToInner,
  TransactionalEmailsApi,
  TransactionalEmailsApiApiKeys,
} from "@getbrevo/brevo";
import * as fs from "fs";
import * as hbs from "handlebars";
import path from "path";

import logger from "./logger";

export interface EmailSender {
  email: string;
  name: string;
}

export class BrevoService {
  private accountInstance: AccountApi;
  private apiInstance: TransactionalEmailsApi;

  constructor() {
    this.accountInstance = new AccountApi();
    this.accountInstance.setApiKey(
      AccountApiApiKeys.apiKey,
      process.env.BREVO_API_KEY as string
    );

    this.apiInstance = new TransactionalEmailsApi();
    this.apiInstance.setApiKey(
      TransactionalEmailsApiApiKeys.apiKey,
      process.env.BREVO_API_KEY as string
    );

    this.accountInstance
      .getAccount()
      .then((_) => logger.info(`Brevo service is "UP"`))
      .catch((err) => logger.error(`Brevo service is "DOWN", err: ${err}`));
  }

  private compileTemplateToHtml(
    templatePath: string,
    replacements: object
  ): string {
    const html = fs.readFileSync(
      path.join(process.cwd(), "src/email-templates", templatePath),
      { encoding: "utf-8" }
    );
    let template = hbs.compile(html);
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
    replacements: object
  ): Promise<any> {
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
