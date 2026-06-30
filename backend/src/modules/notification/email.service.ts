import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

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
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    const fromMail =
      this.configService.get<string>('EMAIL_FROM') ||
      'MealAI <onboarding@resend.dev>';

    if (!apiKey) {
      const safeHtml = html.replace(/([?&]token=)[^"'&<\s]+/gi, '$1[hidden]');
      this.logger.warn('RESEND_API_KEY is missing. Email was not delivered.');
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

    const resend = new Resend(apiKey);

    try {
      const { data, error } = await this.withTimeout(
        resend.emails.send({
          from: fromMail,
          to: [to],
          subject,
          html,
        }),
        this.sendTimeoutMs,
      );

      if (error) {
        const resendError = new Error(error.message);
        (resendError as Error & { code?: string }).code =
          error.name || 'RESEND_API_ERROR';
        throw resendError;
      }

      this.logger.log(`Email sent successfully (${data?.id || 'accepted'})`);
      return { success: true };
    } catch (err: any) {
      const code = this.getErrorCode(err);
      this.logger.error(`Email delivery failed (${code})`);
      return { success: false, code };
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

    const subject = 'Đặt lại mật khẩu MealAI';
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
    const code = String(error?.code || error?.name || '').toUpperCase();
    if (['ETIMEDOUT', 'VALIDATION_ERROR', 'MISSING_REQUIRED_FIELD'].includes(code)) {
      return code;
    }
    if (/timeout/i.test(String(error?.message || ''))) {
      return 'ETIMEDOUT';
    }
    return code || 'EMAIL_SEND_FAILED';
  }
}
