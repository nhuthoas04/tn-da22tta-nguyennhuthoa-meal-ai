import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, IsNull } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User } from './entities/user.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/auth.dto';
import { EmailService } from '../notification/email.service';

@Injectable()
export class PasswordResetService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(PasswordResetToken)
    private readonly tokenRepo: Repository<PasswordResetToken>,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });

    if (user) {
      // 1. Generate secure random token
      const rawToken = crypto.randomBytes(32).toString('hex');
      // 2. Hash token for secure DB storage
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      // 3. Token expiration: 30 minutes
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 30);

      // 4. Save to DB
      const resetToken = this.tokenRepo.create({
        userId: user.id,
        tokenHash,
        expiresAt,
      });
      await this.tokenRepo.save(resetToken);

      // 5. Send email containing raw token in link
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
      const resetLink = `${frontendUrl}/reset-password?token=${rawToken}`;

      // In non-production environments, log link to console for easier testing
      if (this.configService.get<string>('NODE_ENV') !== 'production') {
        const safeResetLink = resetLink.replace(
          /([?&]token=)[^&]+/i,
          '$1[hidden]',
        );
        console.log(`\n======================================================`);
        console.log(`[PASSWORD RESET DEV LINK]`);
        console.log(`Email: ${dto.email}`);
        console.log(`Link: ${safeResetLink}`);
        console.log(`======================================================\n`);
      }

      const mailSubject = 'MealAI - Đặt lại mật khẩu';
      const mailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #10b981; text-align: center;">MealAI</h2>
          <p>Xin chào,</p>
          <p>Bạn vừa yêu cầu đặt lại mật khẩu cho tài khoản MealAI.</p>
          <p>Vui lòng bấm vào liên kết bên dưới để đặt lại mật khẩu:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 6px; display: inline-block;">
              Đặt lại mật khẩu
            </a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">Nếu nút ở trên không hoạt động, bạn cũng có thể sao chép liên kết dưới đây vào trình duyệt của mình:</p>
          <p style="word-break: break-all; color: #10b981;">${resetLink}</p>
          <p style="color: #ef4444; font-size: 14px; margin-top: 20px;">Liên kết này sẽ hết hạn sau 30 phút.</p>
          <p>Nếu bạn không yêu cầu thao tác này, vui lòng bỏ qua email này.</p>
          <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="font-size: 12px; color: #6b7280; text-align: center;">Đây là email tự động từ hệ thống MealAI. Vui lòng không phản hồi lại email này.</p>
        </div>
      `;

      await this.emailService.sendMail(dto.email, mailSubject, mailHtml);
    }

    return {
      message: 'Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được gửi.',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Mật khẩu xác nhận không khớp');
    }

    // 1. Hash the incoming raw token
    const tokenHash = crypto.createHash('sha256').update(dto.token).digest('hex');

    // 2. Find matching unused, unexpired token
    const tokenRecord = await this.tokenRepo.findOne({
      where: {
        tokenHash,
        usedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      relations: ['user'],
    });

    if (!tokenRecord || !tokenRecord.user) {
      throw new BadRequestException('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.');
    }

    // 3. Mark token as used
    tokenRecord.usedAt = new Date();
    await this.tokenRepo.save(tokenRecord);

    // 4. Hash and update new user password
    tokenRecord.user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepo.save(tokenRecord.user);

    return {
      message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.',
    };
  }
}
