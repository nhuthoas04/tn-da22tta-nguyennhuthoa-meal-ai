import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import { UserPreference } from './entities/user-preference.entity';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CalorieService } from '../recommendation/calorie.service';
import { Favorite } from '../recipes/entities/favorite.entity';
import { Recipe } from '../recipes/entities/recipe.entity';
import { RecipeRating } from '../recipes/entities/recipe-rating.entity';
import { MealPlan } from '../meal-plan/entities/meal-plan.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(UserPreference)
    private prefRepo: Repository<UserPreference>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private calorieService: CalorieService,
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
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });
    await this.userRepo.save(user);

    // Create default preferences
    const prefs = this.prefRepo.create({ userId: user.id, servings: null });
    await this.prefRepo.save(prefs);

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      emailVerified: user.emailVerified,
      message: 'Đăng ký thành công. Bạn có thể đăng nhập ngay.',
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
