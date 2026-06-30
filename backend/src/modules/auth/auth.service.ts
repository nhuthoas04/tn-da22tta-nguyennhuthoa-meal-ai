import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User } from './entities/user.entity';
import { UserPreference } from './entities/user-preference.entity';
import { EmailVerificationToken } from './entities/email-verification-token.entity';
import {
  LoginDto,
  RegisterDto,
  ResendVerificationEmailDto,
  VerifyEmailDto,
} from './dto/auth.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CalorieService } from '../recommendation/calorie.service';
import { Favorite } from '../recipes/entities/favorite.entity';
import { Recipe } from '../recipes/entities/recipe.entity';
import { RecipeRating } from '../recipes/entities/recipe-rating.entity';
import { MealPlan } from '../meal-plan/entities/meal-plan.entity';
import { EmailService } from '../notification/email.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(UserPreference)
    private prefRepo: Repository<UserPreference>,
    @InjectRepository(EmailVerificationToken)
    private emailVerificationTokenRepo: Repository<EmailVerificationToken>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private calorieService: CalorieService,
    private emailService: EmailService,
  ) {}

  // ==================== REGISTER ====================
  async register(dto: RegisterDto) {
    // Check if email already exists
    const exists = await this.userRepo.findOne({ where: { email: dto.email } });
    if (exists) {
      throw new ConflictException('Email already registered');
    }

    // Hash password with bcrypt (10 salt rounds)
    const passwordHash = await bcrypt.hash(dto.password, 10);

    // Create user
    const user = this.userRepo.create({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      emailVerified: false,
      emailVerifiedAt: null,
    });
    await this.userRepo.save(user);

    // Create default preferences
    const prefs = this.prefRepo.create({ userId: user.id, servings: null });
    await this.prefRepo.save(prefs);

    const emailResult = await this.createAndSendVerificationEmail(user);

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      emailVerified: user.emailVerified,
      emailSent: emailResult.success,
      message: emailResult.success
        ? 'Đăng ký thành công. Vui lòng kiểm tra email để xác thực tài khoản.'
        : 'Đăng ký thành công nhưng chưa thể gửi email xác thực. Hãy đăng nhập và chọn gửi lại email xác thực.',
    };
  }

  // ==================== LOGIN ====================
  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({
      where: { email: dto.email },
      relations: ['preferences'],
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Compare password with hash
    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.emailVerified) {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message:
          'Tài khoản chưa xác thực email. Vui lòng kiểm tra Gmail để xác nhận tài khoản.',
      });
    }

    const tokens = await this.generateTokens(user);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        dailyCalorieTarget: user.dailyCalorieTarget,
        emailVerified: user.emailVerified,
      },
    };
  }

  // ==================== EMAIL VERIFICATION ====================
  async verifyEmail(dto: VerifyEmailDto) {
    if (!dto?.token) {
      throw new BadRequestException('Thiếu token xác thực email.');
    }

    const tokenHash = this.hashToken(dto.token);
    const tokenRecord = await this.emailVerificationTokenRepo.findOne({
      where: {
        tokenHash,
        usedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      relations: ['user'],
    });

    if (!tokenRecord || !tokenRecord.user) {
      throw new BadRequestException(
        'Link xác thực không hợp lệ hoặc đã hết hạn.',
      );
    }

    tokenRecord.usedAt = new Date();
    tokenRecord.user.emailVerified = true;
    tokenRecord.user.emailVerifiedAt = new Date();

    await this.emailVerificationTokenRepo.save(tokenRecord);
    await this.userRepo.save(tokenRecord.user);

    const tokens = await this.generateTokens(tokenRecord.user);

    return {
      message: 'Xác thực email thành công.',
      ...tokens,
      user: {
        id: tokenRecord.user.id,
        email: tokenRecord.user.email,
        fullName: tokenRecord.user.fullName,
        role: tokenRecord.user.role,
        dailyCalorieTarget: tokenRecord.user.dailyCalorieTarget,
        emailVerified: tokenRecord.user.emailVerified,
      },
    };
  }

  async resendVerificationEmail(dto: ResendVerificationEmailDto) {
    const genericMessage =
      'Nếu email tồn tại và chưa xác thực, liên kết xác thực mới đã được gửi.';

    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user) {
      return { message: genericMessage };
    }

    if (user.emailVerified) {
      return { message: 'Tài khoản này đã được xác thực email.' };
    }

    const latestToken = await this.emailVerificationTokenRepo.findOne({
      where: { userId: user.id, usedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });

    if (latestToken) {
      const retryAt = new Date(latestToken.createdAt.getTime() + 60 * 1000);
      if (retryAt > new Date()) {
        const seconds = Math.ceil((retryAt.getTime() - Date.now()) / 1000);
        throw new BadRequestException(
          `Vui lòng chờ ${seconds} giây trước khi gửi lại email xác thực.`,
        );
      }
    }

    const emailResult = await this.createAndSendVerificationEmail(user);
    if (!emailResult.success) {
      throw new ServiceUnavailableException({
        code: emailResult.code || 'EMAIL_SEND_FAILED',
        message:
          'Hiện không thể gửi email xác thực. Vui lòng thử lại sau.',
      });
    }

    return { success: true, message: genericMessage };
  }

  // ==================== REFRESH TOKEN ====================
  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      const user = await this.userRepo.findOne({ where: { id: payload.sub } });
      if (!user) throw new UnauthorizedException();

      return this.generateTokens(user);
    } catch (e) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  // ==================== GET PROFILE ====================
  async getProfile(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['preferences'],
    });

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified,
      emailVerifiedAt: user.emailVerifiedAt,
      gender: user.gender,
      dateOfBirth: user.dateOfBirth,
      weight: user.weight,
      height: user.height,
      activityLevel: user.activityLevel,
      dailyCalorieTarget: user.dailyCalorieTarget,
      preferences: user.preferences
        ? {
            dietType: user.preferences.dietType,
            allergies: user.preferences.allergies || [],
            dislikedIngredients: user.preferences.dislikedIngredients || [],
            likedIngredients: user.preferences.likedIngredients || [],
            cuisineTags: user.preferences.cuisineTags || [],
            maxCookingTime: user.preferences.maxCookingTime,
            budgetPerMeal: user.preferences.budgetPerMeal,
            servings: user.preferences.servings,
            healthConditions: user.preferences.healthConditions || '',
            maxSugarPerMeal: (user.preferences.maxSugarPerMeal !== null && user.preferences.maxSugarPerMeal !== undefined)
              ? Number(user.preferences.maxSugarPerMeal)
              : null,
            maxSodiumPerMeal: (user.preferences.maxSodiumPerMeal !== null && user.preferences.maxSodiumPerMeal !== undefined)
              ? Number(user.preferences.maxSodiumPerMeal)
              : null,
            minProteinPerMeal: (user.preferences.minProteinPerMeal !== null && user.preferences.minProteinPerMeal !== undefined)
              ? Number(user.preferences.minProteinPerMeal)
              : null,
          }
        : null,
    };
  }

  // ==================== UPDATE PROFILE ====================
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['preferences'],
    });
    if (!user) throw new UnauthorizedException('User not found');

    // Update user fields
    if (dto.fullName !== undefined) user.fullName = dto.fullName;
    if (dto.gender !== undefined) user.gender = dto.gender;
    if (dto.dateOfBirth !== undefined)
      user.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    if (dto.weight !== undefined) user.weight = dto.weight;
    if (dto.height !== undefined) user.height = dto.height;
    if (dto.activityLevel !== undefined) user.activityLevel = dto.activityLevel;

    // Recalculate TDEE if body metrics changed
    if (
      dto.weight !== undefined ||
      dto.height !== undefined ||
      dto.gender !== undefined ||
      dto.dateOfBirth !== undefined ||
      dto.activityLevel !== undefined
    ) {
      user.dailyCalorieTarget = this.calorieService.calculateTDEE(user);
    }

    await this.userRepo.save(user);

    // Update preferences if provided
    if (dto.preferences) {
      let prefs = user.preferences;
      if (!prefs) {
        prefs = this.prefRepo.create({ userId });
      }
      Object.assign(prefs, dto.preferences);
      await this.prefRepo.save(prefs);
    }

    // Return calorie breakdown
    const breakdown = this.calorieService.getMealDistribution(
      user.dailyCalorieTarget,
    );

    return {
      message: 'Profile updated',
      dailyCalorieTarget: user.dailyCalorieTarget,
      calorieBreakdown: breakdown,
    };
  }

  // ==================== ADMIN USER MANAGEMENT ====================
  async adminListAllUsers() {
    const users = await this.userRepo.find({
      order: { createdAt: 'DESC' },
    });
    return {
      data: users.map((user) => ({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        gender: user.gender,
        weight: user.weight,
        height: user.height,
        activityLevel: user.activityLevel,
        dailyCalorieTarget: user.dailyCalorieTarget,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      })),
    };
  }

  async adminCreateUser(dto: RegisterDto & { role?: string }) {
    const exists = await this.userRepo.findOne({ where: { email: dto.email } });
    if (exists) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.userRepo.create({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      role: dto.role || 'user',
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });
    await this.userRepo.save(user);

    // Create default preferences
    const prefs = this.prefRepo.create({ userId: user.id });
    await this.prefRepo.save(prefs);

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    };
  }

  async adminUpdateUser(
    id: string,
    dto: {
      fullName?: string;
      email?: string;
      password?: string;
      role?: string;
    },
  ) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new ConflictException('User not found');
    }

    if (dto.email && dto.email !== user.email) {
      const exists = await this.userRepo.findOne({
        where: { email: dto.email },
      });
      if (exists) {
        throw new ConflictException('Email already registered');
      }
      user.email = dto.email;
    }

    if (dto.fullName) user.fullName = dto.fullName;
    if (dto.role) user.role = dto.role;

    if (dto.password) {
      user.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    await this.userRepo.save(user);
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      emailVerified: user.emailVerified,
      updatedAt: user.updatedAt,
    };
  }

  async adminDeleteUser(id: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new ConflictException('User not found');
    }

    await this.userRepo.remove(user);
    return { message: 'User deleted successfully' };
  }

  // ==================== HELPERS ====================
  private async generateTokens(user: User) {
    const payload = { sub: user.id, email: user.email, role: user.role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('JWT_SECRET'),
        expiresIn: this.configService.get('JWT_EXPIRES_IN', '1d'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d'),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private hashToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async createAndSendVerificationEmail(user: User) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await this.emailVerificationTokenRepo.update(
      { userId: user.id, usedAt: IsNull() },
      { usedAt: new Date() },
    );

    const tokenRecord = this.emailVerificationTokenRepo.create({
      userId: user.id,
      tokenHash,
      expiresAt,
    });
    await this.emailVerificationTokenRepo.save(tokenRecord);

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ||
      'http://localhost:3000';
    const verificationLink = `${frontendUrl}/verify-email?token=${rawToken}`;

    const subject = 'Xác thực tài khoản MealAI';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #d1fae5; border-radius: 12px; color: #0f172a;">
        <h2 style="color: #059669; text-align: center; margin-top: 0;">MealAI</h2>
        <p>Xin chào ${user.fullName || ''},</p>
        <p>Bạn vừa đăng ký tài khoản MealAI bằng email này.</p>
        <p>Vui lòng bấm vào nút bên dưới để xác thực tài khoản.</p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${verificationLink}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 8px; display: inline-block;">
            Xác thực tài khoản
          </a>
        </div>
        <p style="color: #64748b; font-size: 14px;">Link xác thực có hiệu lực trong 24 giờ.</p>
        <p style="color: #64748b; font-size: 14px;">Nếu nút ở trên không hoạt động, bạn có thể sao chép liên kết sau vào trình duyệt:</p>
        <p style="word-break: break-all; color: #059669;">${verificationLink}</p>
        <p>Nếu bạn không thực hiện đăng ký, vui lòng bỏ qua email này.</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="font-size: 12px; color: #94a3b8; text-align: center;">Đây là email tự động từ hệ thống MealAI. Vui lòng không phản hồi email này.</p>
      </div>
    `;

    const emailResult = await this.emailService.sendMail(
      user.email,
      subject,
      html,
    );

    if (!emailResult.success) {
      await this.emailVerificationTokenRepo.delete(tokenRecord.id);
    }

    return emailResult;
  }

  // ==================== STATISTICS ====================
  async getProfileStats(userId: string) {
    const favoriteRepo = this.userRepo.manager.getRepository(Favorite);
    const recipeRepo = this.userRepo.manager.getRepository(Recipe);
    const ratingRepo = this.userRepo.manager.getRepository(RecipeRating);
    const mealPlanRepo = this.userRepo.manager.getRepository(MealPlan);

    const [totalFavorites, totalRecipes, mealPlansCount] = await Promise.all([
      favoriteRepo.count({ where: { userId } }),
      recipeRepo.count({ where: { submittedBy: userId } }),
      mealPlanRepo.count({ where: { userId } }),
    ]);

    // Total views of submitted recipes
    const viewsResult = await recipeRepo
      .createQueryBuilder('recipe')
      .select('SUM(recipe.views)', 'sum')
      .where('recipe.submittedBy = :userId', { userId })
      .getRawOne();
    const totalViews = parseInt(viewsResult?.sum || '0', 10);

    // Average rating of submitted recipes
    const ratingResult = await ratingRepo
      .createQueryBuilder('rating')
      .innerJoin('rating.recipe', 'recipe')
      .select('AVG(rating.rating)', 'avg')
      .where('recipe.submittedBy = :userId', { userId })
      .andWhere('rating.moderationStatus = :status', { status: 'reviewed' })
      .getRawOne();
    const averageRating = parseFloat(ratingResult?.avg || '0');

    return {
      totalFavorites,
      totalRecipes,
      totalViews,
      averageRating: Math.round(averageRating * 10) / 10,
      totalMealPlans: mealPlansCount,
    };
  }
}
