import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendMail(to: string, subject: string, html: string) {
    const host = this.configService.get<string>('SMTP_HOST') || this.configService.get<string>('MAIL_HOST');
    const port = Number(this.configService.get<any>('SMTP_PORT') || this.configService.get<any>('MAIL_PORT') || 587);
    const smtpSecure = this.configService.get<string>('SMTP_SECURE');
    const secure = smtpSecure !== undefined ? smtpSecure === 'true' : port === 465;
    const userMail = this.configService.get<string>('SMTP_USER') || this.configService.get<string>('MAIL_USER');
    const passMail = this.configService.get<string>('SMTP_PASS') || this.configService.get<string>('MAIL_PASS');
    const fromMail =
      this.configService.get<string>('SMTP_FROM') ||
      this.configService.get<string>('MAIL_FROM') ||
      (userMail ? `MealAI <${userMail}>` : 'MealAI <no-reply@recipe-ai.com>');

    if (!host || !userMail || !passMail) {
      const safeHtml = html.replace(/([?&]token=)[^"'&<\s]+/gi, '$1[hidden]');
      this.logger.warn(`MAIL CONFIG IS MISSING. FALLBACK TO CONSOLE LOG.`);
      this.logger.log(
        `\n======================================================`,
      );
      this.logger.log(`[EMAIL FALLBACK]`);
      this.logger.log(`To: ${to}`);
      this.logger.log(`Subject: ${subject}`);
      this.logger.log(`Content:\n${safeHtml}`);
      this.logger.log(
        `======================================================\n`,
      );
      return;
    }

    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user: userMail,
          pass: passMail,
        },
      });

      await transporter.sendMail({
        from: fromMail,
        to,
        subject,
        html,
      });
      this.logger.log(`Email sent successfully to ${to}`);
    } catch (err: any) {
      this.logger.error(`Failed to send email to ${to}: ${err.message}`);
    }
  }
}
