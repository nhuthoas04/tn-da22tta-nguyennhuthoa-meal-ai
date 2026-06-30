import {
  Injectable,
  BadRequestException,
  ServiceUnavailableException,
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

      const emailResult = await this.emailService.sendPasswordResetEmail(
        dto.email,
        resetLink,
      );

      if (!emailResult.success) {
        throw new ServiceUnavailableException({
          code: emailResult.code || 'EMAIL_SEND_FAILED',
          message:
            'Hiện không thể gửi email đặt lại mật khẩu. Vui lòng thử lại sau.',
        });
      }

      if (emailResult.debug) {
        return {
          success: true,
          debug: true,
          message:
            'Đã tạo liên kết đặt lại mật khẩu ở chế độ demo. Kiểm tra log backend.',
        };
      }
    }

    return {
      success: true,
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
