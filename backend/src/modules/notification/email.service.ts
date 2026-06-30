import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface EmailSendResult {
  success: boolean;
  code?: string;
  debug?: boolean;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly sendTimeoutMs = 9000;

  constructor(private readonly configService: ConfigService) {}

  async sendMail(
    to: string,
    subject: string,
    html: string,
  ): Promise<EmailSendResult> {
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
      return { success: false, code: 'EMAIL_CONFIG_MISSING' };
    }

    // Some free hosting tiers block outbound SMTP. This adapter is kept
    // isolated so production can move to an HTTP email provider if needed.
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user: userMail,
        pass: passMail,
      },
      connectionTimeout: this.sendTimeoutMs,
      greetingTimeout: this.sendTimeoutMs,
      socketTimeout: this.sendTimeoutMs,
    });

    try {
      await this.withTimeout(
        transporter.sendMail({
          from: fromMail,
          to,
          subject,
          html,
        }),
        this.sendTimeoutMs,
      );
      this.logger.log(`Email sent successfully to ${to}`);
      return { success: true };
    } catch (err: any) {
      const code = this.getErrorCode(err);
      this.logger.error(`Email delivery failed (${code})`);
      return { success: false, code };
    } finally {
      transporter.close();
    }
  }

  async sendPasswordResetEmail(
    email: string,
    resetLink: string,
  ): Promise<EmailSendResult> {
    const debugEnabled =
      this.configService.get<string>('NODE_ENV') !== 'production' ||
      this.configService.get<string>('EMAIL_DEBUG') === 'true';

    if (debugEnabled) {
      this.logger.debug(`Password reset link for ${email}: ${resetLink}`);
    }

    const subject = 'MealAI - Đặt lại mật khẩu';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #10b981; text-align: center;">MealAI</h2>
        <p>Xin chào,</p>
        <p>Bạn vừa yêu cầu đặt lại mật khẩu cho tài khoản MealAI.</p>
        <p>Vui lòng bấm vào nút bên dưới để tạo mật khẩu mới:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 6px; display: inline-block;">
            Đặt lại mật khẩu
          </a>
        </div>
        <p style="color: #6b7280; font-size: 14px;">Nếu nút không hoạt động, hãy sao chép liên kết sau vào trình duyệt:</p>
        <p style="word-break: break-all; color: #10b981;">${resetLink}</p>
        <p style="color: #ef4444; font-size: 14px; margin-top: 20px;">Liên kết có hiệu lực trong 30 phút.</p>
        <p>Nếu bạn không yêu cầu thao tác này, vui lòng bỏ qua email.</p>
      </div>
    `;

    const result = await this.sendMail(email, subject, html);
    if (!result.success && debugEnabled) {
      return { success: true, code: result.code, debug: true };
    }
    return result;
  }

  private async withTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        const error = new Error('Email delivery timed out');
        (error as Error & { code?: string }).code = 'ETIMEDOUT';
        reject(error);
      }, timeoutMs);
    });

    try {
      return await Promise.race([operation, timeoutPromise]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private getErrorCode(error: any): string {
    const code = String(error?.code || '').toUpperCase();
    if (['ECONNECTION', 'ETIMEDOUT', 'EAUTH'].includes(code)) {
      return code;
    }
    if (/timeout/i.test(String(error?.message || ''))) {
      return 'ETIMEDOUT';
    }
    return code || 'EMAIL_SEND_FAILED';
  }
}
