import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';
import { JwtStrategy } from './jwt.strategy';
import { User } from './entities/user.entity';
import { UserPreference } from './entities/user-preference.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { EmailVerificationToken } from './entities/email-verification-token.entity';
import { RecommendationModule } from '../recommendation/recommendation.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserPreference,
      PasswordResetToken,
      EmailVerificationToken,
    ]),
    PassportModule,
    JwtModule.register({}), // Config is done per-sign in AuthService
    forwardRef(() => RecommendationModule),
    NotificationModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordResetService, JwtStrategy],
  exports: [AuthService, PasswordResetService, TypeOrmModule],
})
export class AuthModule {}
