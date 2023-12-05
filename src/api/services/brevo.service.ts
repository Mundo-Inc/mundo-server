import * as SibApiV3Sdk from "@sendinblue/client";
import { SendSmtpEmail, SendSmtpEmailTo } from "@sendinblue/client";
import path from "path";
import * as fs from "fs";
import * as hbs from "handlebars";
import logger from "./logger";

export interface EmailSender {
  email: string;
  name: string;
}

export class BrevoService {
  private accountInstance: SibApiV3Sdk.AccountApi;
  private apiInstance: SibApiV3Sdk.TransactionalEmailsApi;

  constructor() {
    this.accountInstance = new SibApiV3Sdk.AccountApi();
    this.accountInstance.setApiKey(
      SibApiV3Sdk.AccountApiApiKeys.apiKey,
      process.env.BREVO_API_KEY as string
    );

    this.apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    this.apiInstance.setApiKey(
      SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey,
      process.env.BREVO_API_KEY as string
    );

    this.accountInstance
      .getAccount()
      .then((data) => logger.info(`Brevo service is "UP", data: ${data}`))
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
    receivers: SendSmtpEmailTo[],
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
