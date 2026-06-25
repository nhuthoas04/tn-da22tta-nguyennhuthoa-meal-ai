import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
import { Recipe } from './entities/recipe.entity';
import { Favorite } from './entities/favorite.entity';
import { Ingredient } from './entities/ingredient.entity';
import { RecipeIngredient } from './entities/recipe-ingredient.entity';
import { RecipeRating } from './entities/recipe-rating.entity';
import { RecipeRatingService } from './recipe-rating.service';
import { CreateRecipeDto } from './dto/create-recipe.dto';
import { RecipeView } from './entities/recipe-view.entity';
import { RecipeEditHistory } from './entities/recipe-edit-history.entity';
import { RecipeModerationAudit } from './entities/recipe-moderation-audit.entity';
import { NotificationService } from '../notification/notification.service';
import { EmailService } from '../notification/email.service';
import {
  normalizeRecipeForRead,
  normalizeRecipeIngredients,
  normalizeRecipeScalarData,
  normalizeRecipeSteps,
} from './recipe-normalization.util';

@Injectable()
export class RecipesService implements OnModuleInit {
  private readonly viewCooldownMs = 6 * 60 * 60 * 1000;

  constructor(
    @InjectRepository(Recipe) private recipeRepo: Repository<Recipe>,
    @InjectRepository(Favorite) private favoriteRepo: Repository<Favorite>,
    @InjectRepository(Ingredient)
    private ingredientRepo: Repository<Ingredient>,
    @InjectRepository(RecipeIngredient)
    private riRepo: Repository<RecipeIngredient>,
    @InjectRepository(RecipeView) private viewRepo: Repository<RecipeView>,
    @InjectRepository(RecipeEditHistory)
    private editHistoryRepo: Repository<RecipeEditHistory>,
    @InjectRepository(RecipeModerationAudit)
    private auditRepo: Repository<RecipeModerationAudit>,
    private readonly ratingService: RecipeRatingService,
    private readonly notificationService: NotificationService,
    private readonly emailService: EmailService,
  ) {}

  async onModuleInit() {
    await this.migrateLegacyFavoritesTable();
  }

  /**
   * List recipes with search, filtering, and pagination
   * Only shows approved recipes by default
   */
  async findAll(
    query: {
      page?: number;
      limit?: number;
      search?: string;
      tags?: string[];
      mealType?: string;
      maxCookingTime?: number;
      minCalories?: number;
      maxCalories?: number;
      minProtein?: number;
      difficulty?: string;
      excludedIngredients?: string[];
      region?: string;
      sort?: string;
      status?: string; // Admin can filter by status
    },
    currentUserId?: string,
  ) {
    const page = query.page || 1;
    const limit = query.limit || 12;

    const qb = this.recipeRepo
      .createQueryBuilder('recipe')
      .where('recipe.isActive = :active', { active: true });

    // Default: only show approved recipes (admin can override)
    const status = query.status || 'approved';
    qb.andWhere('recipe.status = :status', { status });

    // Search by name
    if (query.search) {
      qb.andWhere('LOWER(recipe.name) LIKE LOWER(:search)', {
        search: `%${query.search}%`,
      });
    }

    // Filter by meal type
    if (query.mealType) {
      qb.andWhere(":mealType = ANY(string_to_array(recipe.mealType, ','))", {
        mealType: query.mealType,
      });
    }

    // Filter by cooking time
    if (query.maxCookingTime) {
      qb.andWhere('recipe.cookingTime <= :maxTime', {
        maxTime: query.maxCookingTime,
      });
    }

    // Filter by calorie range
    if (query.minCalories) {
      qb.andWhere('recipe.calories >= :minCal', { minCal: query.minCalories });
    }
    if (query.maxCalories) {
      qb.andWhere('recipe.calories <= :maxCal', { maxCal: query.maxCalories });
    }
    if (query.minProtein) {
      qb.andWhere('recipe.protein >= :minProtein', {
        minProtein: query.minProtein,
      });
    }
    if (query.difficulty) {
      qb.andWhere('recipe.difficulty = :difficulty', {
        difficulty: query.difficulty,
      });
    }
    if (query.excludedIngredients?.length) {
      qb.andWhere(
        `NOT EXISTS (
          SELECT 1
          FROM recipe_ingredients excluded_ri
          INNER JOIN ingredients excluded_ing ON excluded_ing.id = excluded_ri."ingredientId"
          WHERE excluded_ri."recipeId" = recipe.id
            AND LOWER(excluded_ing.name) LIKE ANY(:excludedIngredients)
        )`,
        {
          excludedIngredients: query.excludedIngredients.map(
            (name) => `%${name.toLowerCase()}%`,
          ),
        },
      );
    }

    // Filter by region
    if (query.region) {
      qb.andWhere('recipe.cuisineRegion = :region', { region: query.region });
    }

    // Sort
    const sortField = query.sort || 'createdAt';
    qb.orderBy(`recipe.${sortField}`, 'DESC');

    qb.addSelect(
      (subQuery) =>
        subQuery
          .select('COALESCE(ROUND(AVG(rating.rating)::numeric, 1), 0)')
          .from(RecipeRating, 'rating')
          .where('rating.recipeId = recipe.id')
          .andWhere('rating.parentId IS NULL')
          .andWhere('rating.rating IS NOT NULL')
          .andWhere('rating.moderationStatus = :reviewedStatus'),
      'averageRating',
    )
      .addSelect(
        (subQuery) =>
          subQuery
            .select('COUNT(*)')
            .from(RecipeRating, 'rating')
            .where('rating.recipeId = recipe.id')
            .andWhere('rating.parentId IS NULL')
            .andWhere('rating.rating IS NOT NULL')
            .andWhere('rating.moderationStatus = :reviewedStatus'),
        'reviewCount',
      )
      .addSelect(
        (subQuery) =>
          subQuery
            .select('COUNT(*)')
            .from(Favorite, 'favorite')
            .where('favorite.recipeId = recipe.id'),
        'favoriteCount',
      )
      .addSelect(
        (subQuery) =>
          subQuery
            .select('GREATEST(COALESCE(recipe.views, 0), COUNT(recipeView.id))')
            .from(RecipeView, 'recipeView')
            .where('recipeView.recipeId = recipe.id'),
        'viewCount',
      )
      .setParameter('reviewedStatus', 'reviewed');

    if (currentUserId) {
      qb.addSelect(
        (subQuery) =>
          subQuery
            .select('COUNT(*)')
            .from(Favorite, 'userFavorite')
            .where('userFavorite.recipeId = recipe.id')
            .andWhere('userFavorite.userId = :currentUserId'),
        'isFavoriteCount',
      ).setParameter('currentUserId', currentUserId);
    }

    const total = await qb.getCount();

    const { entities, raw } = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getRawAndEntities();

    const statsByRecipeId = new Map(
      raw.map((row) => [
        row.recipe_id,
        {
          averageRating: Number(
            parseFloat(row.averageRating ?? row.averagerating ?? '0').toFixed(
              1,
            ),
          ),
          reviewCount: Number(row.reviewCount ?? row.reviewcount ?? 0),
          favoriteCount: Number(row.favoriteCount ?? row.favoritecount ?? 0),
          viewCount: Number(row.viewCount ?? row.viewcount ?? 0),
          isFavorite:
            Number(row.isFavoriteCount ?? row.isfavoritecount ?? 0) > 0,
        },
      ]),
    );

    return {
      data: entities.map((recipe) => ({
        ...recipe,
        averageRating: statsByRecipeId.get(recipe.id)?.averageRating ?? 0,
        reviewCount: statsByRecipeId.get(recipe.id)?.reviewCount ?? 0,
        favoriteCount: statsByRecipeId.get(recipe.id)?.favoriteCount ?? 0,
        isFavorite: statsByRecipeId.get(recipe.id)?.isFavorite ?? false,
        viewCount: statsByRecipeId.get(recipe.id)?.viewCount ?? 0,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /** Find real recipes that use one or more named ingredients. */
  async findByIngredients(
    ingredients: string[],
    options?: {
      limit?: number;
      mealType?: string;
      maxCookingTime?: number;
      maxCalories?: number;
      minProtein?: number;
      excludedIngredients?: string[];
    },
  ) {
    const cleaned = ingredients.map((value) => value.trim()).filter(Boolean);
    if (!cleaned.length) return { data: [], meta: { total: 0 } };

    const qb = this.recipeRepo
      .createQueryBuilder('recipe')
      .innerJoin('recipe.recipeIngredients', 'ri')
      .innerJoin('ri.ingredient', 'ingredient')
      .select('recipe.id', 'id')
      .addSelect('COUNT(DISTINCT ingredient.id)', 'matchCount')
      .where('recipe.isActive = true')
      .andWhere("recipe.status = 'approved'")
      .andWhere(
        cleaned
          .map((_, index) => `LOWER(ingredient.name) LIKE :ingredient${index}`)
          .join(' OR '),
      )
      .groupBy('recipe.id')
      .orderBy('COUNT(DISTINCT ingredient.id)', 'DESC')
      .addOrderBy('recipe.createdAt', 'DESC')
      .limit(options?.limit || 8);

    cleaned.forEach((value, index) => {
      qb.setParameter(`ingredient${index}`, `%${value.toLowerCase()}%`);
    });
    if (options?.mealType) {
      qb.andWhere(":mealType = ANY(string_to_array(recipe.mealType, ','))", {
        mealType: options.mealType,
      });
    }
    if (options?.maxCookingTime) {
      qb.andWhere('recipe.cookingTime <= :ingredientMaxTime', {
        ingredientMaxTime: options.maxCookingTime,
      });
    }
    if (options?.maxCalories) {
      qb.andWhere('recipe.calories <= :ingredientMaxCalories', {
        ingredientMaxCalories: options.maxCalories,
      });
    }
    if (options?.minProtein) {
      qb.andWhere('recipe.protein >= :ingredientMinProtein', {
        ingredientMinProtein: options.minProtein,
      });
    }
    if (options?.excludedIngredients?.length) {
      qb.andWhere(
        `NOT EXISTS (
          SELECT 1
          FROM recipe_ingredients excluded_ri
          INNER JOIN ingredients excluded_ing ON excluded_ing.id = excluded_ri."ingredientId"
          WHERE excluded_ri."recipeId" = recipe.id
            AND LOWER(excluded_ing.name) LIKE ANY(:ingredientExclusions)
        )`,
        {
          ingredientExclusions: options.excludedIngredients.map(
            (name) => `%${name.toLowerCase()}%`,
          ),
        },
      );
    }

    const ranked = await qb.getRawMany<{ id: string; matchCount: string }>();
    const ids = ranked.map((row) => row.id);
    if (!ids.length) return { data: [], meta: { total: 0 } };

    const recipes = await this.recipeRepo.find({ where: { id: In(ids) } });
    const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
    return {
      data: ids.map((id) => byId.get(id)).filter(Boolean),
      meta: { total: ids.length, matchedIngredients: cleaned },
    };
  }

  /**
   * Get full recipe details with ingredients and steps
   */
  async findOne(
    id: string,
    options?: {
      userId?: string;
      viewerKey?: string;
      userAgent?: string | null;
    },
  ) {
    const recipe = await this.recipeRepo.findOne({
      where: { id },
      relations: [
        'recipeIngredients',
        'recipeIngredients.ingredient',
        'submitter',
      ],
    });

    if (!recipe) throw new NotFoundException('Recipe not found');

    await this.recordRecipeView(
      id,
      options?.userId,
      options?.viewerKey,
      options?.userAgent,
    );

    // Check if favorited by current user
    let isFavorite = false;
    if (options?.userId) {
      const fav = await this.favoriteRepo.findOne({
        where: { userId: options.userId, recipeId: id },
      });
      isFavorite = !!fav;
    }

    const [ratingStats, favoriteCount, viewCount] = await Promise.all([
      this.ratingService.getAverageRatingForRecipe(id),
      this.favoriteRepo.count({ where: { recipeId: id } }),
      this.getRecipeViewCount(id, recipe.views || 0),
    ]);

    const normalizedRecipe = normalizeRecipeForRead(recipe);

    return {
      ...normalizedRecipe,
      ingredients: recipe.recipeIngredients.map((ri) => ({
        id: ri.ingredient.id,
        name: ri.ingredient.name,
        quantity: ri.quantity,
        unit: ri.unit,
        isOptional: ri.isOptional,
      })),
      isFavorite,
      isFavorited: isFavorite,
      averageRating: ratingStats.average,
      reviewCount: ratingStats.count,
      totalRatings: ratingStats.count,
      favoriteCount,
      viewCount,
      views: viewCount,
      submitterName: recipe.submitter?.fullName || null,
      recipeIngredients: undefined, // Remove raw junction data
      submitter: undefined,
    };
  }

  /**
   * Add a recipe to favorites
   */
  async addFavorite(userId: string, recipeId: string) {
    this.assertFavoriteInput(userId, recipeId);

    const existing = await this.favoriteRepo.findOne({
      where: { userId, recipeId },
    });

    const recipe = await this.recipeRepo.findOne({ where: { id: recipeId } });
    if (!recipe) throw new NotFoundException('Recipe not found');

    if (!existing) {
      const favorite = this.favoriteRepo.create({ userId, recipeId });
      await this.favoriteRepo.save(favorite);

      // Send notification if not self-action
      if (recipe.submittedBy) {
        await this.notificationService.createNotification(
          recipe.submittedBy,
          userId,
          recipeId,
          'SAVE_RECIPE',
          'Có người vừa yêu thích công thức bạn chia sẻ.',
        );
      }
    }

    const favoriteCount = await this.favoriteRepo.count({
      where: { recipeId },
    });
    return {
      isFavorite: true,
      isFavorited: true,
      favoriteCount,
      message: 'Đã thêm vào danh sách yêu thích',
    };
  }

  /**
   * Remove a recipe from favorites
   */
  async removeFavorite(userId: string, recipeId: string) {
    this.assertFavoriteInput(userId, recipeId);

    const recipe = await this.recipeRepo.findOne({ where: { id: recipeId } });
    if (!recipe) throw new NotFoundException('Recipe not found');

    const existing = await this.favoriteRepo.findOne({
      where: { userId, recipeId },
    });

    if (existing) {
      await this.favoriteRepo.remove(existing);
    }

    const favoriteCount = await this.favoriteRepo.count({
      where: { recipeId },
    });
    return {
      isFavorite: false,
      isFavorited: false,
      favoriteCount,
      message: 'Đã bỏ yêu thích công thức',
    };
  }

  async getFavoriteStatus(userId: string, recipeId: string) {
    this.assertFavoriteInput(userId, recipeId);

    const recipe = await this.recipeRepo.findOne({ where: { id: recipeId } });
    if (!recipe) throw new NotFoundException('Recipe not found');

    const [existing, favoriteCount] = await Promise.all([
      this.favoriteRepo.findOne({ where: { userId, recipeId } }),
      this.favoriteRepo.count({ where: { recipeId } }),
    ]);

    return {
      isFavorite: !!existing,
      isFavorited: !!existing,
      favoriteCount,
    };
  }

  /**
   * Get user's favorited recipes with pagination, search, and category stats
   */
  async getFavorites(
    userId: string,
    query?: {
      page?: number;
      limit?: number;
      search?: string;
      category?: string;
    },
  ) {
    const page = Number(query?.page) || 1;
    const limit = Number(query?.limit) || 8;

    const qb = this.favoriteRepo
      .createQueryBuilder('favorite')
      .innerJoinAndSelect('favorite.recipe', 'recipe')
      .where('favorite.userId = :userId', { userId });

    if (query?.search) {
      qb.andWhere('LOWER(recipe.name) LIKE LOWER(:search)', {
        search: `%${query.search}%`,
      });
    }

    if (query?.category) {
      if (query.category === 'Khác') {
        qb.andWhere(
          '(recipe.cuisineRegion IS NULL OR recipe.cuisineRegion = :empty OR recipe.cuisineRegion = :category)',
          {
            empty: '',
            category: 'Khác',
          },
        );
      } else {
        qb.andWhere('recipe.cuisineRegion = :category', {
          category: query.category,
        });
      }
    }

    const [favs, total] = await qb
      .orderBy('favorite.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    // Calculate stats for all favorites of this user
    const allFavs = await this.favoriteRepo
      .createQueryBuilder('favorite')
      .innerJoinAndSelect('favorite.recipe', 'recipe')
      .where('favorite.userId = :userId', { userId })
      .getMany();

    const categoryStats: Record<string, number> = {};
    allFavs.forEach((f) => {
      const region = f.recipe.cuisineRegion || 'Khác';
      categoryStats[region] = (categoryStats[region] || 0) + 1;
    });

    return {
      data: favs.map((f) => ({
        id: f.recipe.id,
        name: f.recipe.name,
        calories: f.recipe.calories,
        imageUrl: f.recipe.imageUrl,
        cookingTime: f.recipe.cookingTime,
        favoritedAt: f.createdAt,
        cuisineRegion: f.recipe.cuisineRegion,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      categoryStats,
      totalFavorites: allFavs.length,
    };
  }

  // ==================== ADMIN: CRUD ====================

  /**
   * Admin creates a recipe (auto-approved)
   */
  async adminCreate(dto: CreateRecipeDto, adminId: string) {
    const { ingredients, steps, ...scalarData } = dto;
    const recipeData = normalizeRecipeScalarData(scalarData);
    const normalizedSteps = normalizeRecipeSteps(steps);
    const normalizedIngredients = normalizeRecipeIngredients(ingredients);

    const recipe = this.recipeRepo.create({
      ...recipeData,
      steps: normalizedSteps,
      status: 'approved',
      submittedBy: adminId,
    });
    await this.recipeRepo.save(recipe);

    // Link ingredients
    if (normalizedIngredients.length) {
      await this.linkIngredients(recipe.id, normalizedIngredients);
    }

    return { message: 'Recipe created', recipe };
  }

  /**
   * Admin updates a recipe
   */
  async adminUpdate(id: string, dto: CreateRecipeDto) {
    const recipe = await this.recipeRepo.findOne({ where: { id } });
    if (!recipe) throw new NotFoundException('Recipe not found');

    const { ingredients, steps, ...scalarData } = dto;
    const recipeData = normalizeRecipeScalarData(scalarData);
    const normalizedSteps = normalizeRecipeSteps(steps);
    const normalizedIngredients = normalizeRecipeIngredients(ingredients);

    Object.assign(recipe, recipeData, { steps: normalizedSteps });
    await this.recipeRepo.save(recipe);

    // Re-link ingredients if provided
    if (ingredients !== undefined) {
      await this.riRepo.delete({ recipeId: id });
      if (normalizedIngredients.length) {
        await this.linkIngredients(id, normalizedIngredients);
      }
    }

    return { message: 'Recipe updated', recipe };
  }

  /**
   * Admin deletes a recipe
   */
  async adminDelete(id: string) {
    const recipe = await this.recipeRepo.findOne({ where: { id } });
    if (!recipe) throw new NotFoundException('Recipe not found');

    await this.recipeRepo.remove(recipe);
    return { message: 'Recipe deleted' };
  }

  // ==================== ADMIN: MODERATION ====================

  /**
   * Get all pending recipes for admin review
   */
  async getPending(page = 1, limit = 20) {
    const [data, total] = await this.recipeRepo.findAndCount({
      where: { status: 'pending' },
      relations: ['submitter', 'recipeIngredients', 'recipeIngredients.ingredient'],
      order: { createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const dataWithEditFlag = await Promise.all(
      data.map(async (r) => {
        const hasEditHistory = await this.editHistoryRepo.count({
          where: { recipeId: r.id },
        });
        const normalizedRecipe = normalizeRecipeForRead(r);
        return {
          ...normalizedRecipe,
          submitterName: r.submitter?.fullName || 'Unknown',
          submitterEmail: r.submitter?.email || '',
          hasBeenEditedByAdmin: hasEditHistory > 0,
          submitter: undefined,
        };
      }),
    );

    return {
      data: dataWithEditFlag,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Admin approves a pending recipe
   */
  async approve(id: string, adminId: string) {
    const recipe = await this.recipeRepo.findOne({
      where: { id },
      relations: ['submitter'],
    });
    if (!recipe) throw new NotFoundException('Recipe not found');
    if (recipe.status !== 'pending') {
      throw new ForbiddenException('Chỉ có thể duyệt công thức đang chờ duyệt.');
    }

    recipe.status = 'approved';
    recipe.rejectionReason = null;
    await this.recipeRepo.save(recipe);

    if (recipe.submittedBy) {
      // Send system notification
      await this.notificationService.createNotification(
        recipe.submittedBy,
        adminId,
        recipe.id,
        'APPROVED',
        `Công thức ${recipe.name} đã được duyệt và xuất bản.`,
        'Bài viết đã được duyệt',
      );

      // Send email notification
      if (recipe.submitter?.email) {
        const subject = 'Bài viết đã được duyệt - AI Meal Planner';
        const html = `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
                    <h2 style="color: #10b981; text-align: center;">Bài Viết Đã Được Duyệt</h2>
                    <p>Chào bạn,</p>
                    <p>Chúc mừng! Công thức <strong>${recipe.name}</strong> của bạn đã được duyệt và xuất bản thành công trên hệ thống <strong>AI Meal Planner</strong>.</p>
                    <p>Mọi người bây giờ đã có thể tìm kiếm và nấu theo công thức của bạn.</p>
                    <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #6b7280; text-align: center;">Đây là email tự động từ hệ thống AI Meal Planner. Vui lòng không phản hồi lại email này.</p>
                  </div>
                `;
        await this.emailService.sendMail(recipe.submitter.email, subject, html);
      }
    }

    return { message: 'Recipe approved', recipe };
  }

  /**
   * Admin rejects a pending recipe
   */
  async reject(id: string, reason: string, adminId: string) {
    const recipe = await this.recipeRepo.findOne({
      where: { id },
      relations: ['submitter'],
    });
    if (!recipe) throw new NotFoundException('Recipe not found');
    if (recipe.status !== 'pending') {
      throw new ForbiddenException('Chỉ có thể từ chối công thức đang chờ duyệt.');
    }

    recipe.status = 'rejected';
    recipe.rejectionReason = reason;
    await this.recipeRepo.save(recipe);

    if (recipe.submittedBy) {
      // Send system notification
      await this.notificationService.createNotification(
        recipe.submittedBy,
        adminId,
        recipe.id,
        'REJECTED',
        `Kết quả kiểm duyệt: Bài viết chưa đáp ứng yêu cầu. Lý do: ${reason}`,
        'Bài viết bị từ chối',
      );

      // Send email notification
      if (recipe.submitter?.email) {
        const subject = 'Bài viết bị từ chối - AI Meal Planner';
        const html = `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
                    <h2 style="color: #ef4444; text-align: center;">Bài Viết Bị Từ Chối</h2>
                    <p>Chào bạn,</p>
                    <p>Chúng tôi rất tiếc phải thông báo rằng công thức <strong>${recipe.name}</strong> của bạn chưa được phê duyệt.</p>
                    <p><strong>Kết quả kiểm duyệt:</strong> Bài viết chưa đáp ứng yêu cầu.</p>
                    <p><strong>Lý do từ chối:</strong> "${reason}"</p>
                    <p>Bạn có thể chỉnh sửa lại công thức và gửi lại để chúng tôi duyệt lại bất cứ lúc nào.</p>
                    <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #6b7280; text-align: center;">Đây là email tự động từ hệ thống AI Meal Planner. Vui lòng không phản hồi lại email này.</p>
                  </div>
                `;
        await this.emailService.sendMail(recipe.submitter.email, subject, html);
      }
    }

    return { message: 'Recipe rejected', recipe };
  }

  // ==================== USER: SUBMIT RECIPE ====================

  /**
   * User submits a recipe for admin review (pending status)
   */
  async userSubmit(dto: CreateRecipeDto, userId: string) {
    const { ingredients, steps, ...scalarData } = dto;
    const recipeData = normalizeRecipeScalarData(scalarData);
    const normalizedSteps = normalizeRecipeSteps(steps);
    const normalizedIngredients = normalizeRecipeIngredients(ingredients);

    const recipe = this.recipeRepo.create({
      ...recipeData,
      steps: normalizedSteps,
      status: 'pending',
      submittedBy: userId,
    });
    await this.recipeRepo.save(recipe);

    if (normalizedIngredients.length) {
      await this.linkIngredients(recipe.id, normalizedIngredients);
    }

    return { message: 'Recipe submitted for review', recipe };
  }

  /**
   * Get user's submitted recipes with pagination, average rating, and comment counts
   */
  async getUserSubmissions(
    userId: string,
    query?: { page?: number; limit?: number; status?: string },
  ) {
    const page = Number(query?.page) || 1;
    const limit = Number(query?.limit) || 8;

    const qb = this.recipeRepo
      .createQueryBuilder('recipe')
      .where('recipe.submittedBy = :userId', { userId });

    if (query?.status) {
      qb.andWhere('recipe.status = :status', { status: query.status });
    }

    const [recipes, total] = await qb
      .orderBy('recipe.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const data = await Promise.all(
      recipes.map(async (recipe) => {
        const ratingStats = await this.ratingService.getAverageRatingForRecipe(
          recipe.id,
        );
        const commentsCount = await this.recipeRepo.manager
          .getRepository(RecipeRating)
          .count({
            where: { recipeId: recipe.id, moderationStatus: 'reviewed' },
          });
        const hasEditHistory = await this.editHistoryRepo.count({
          where: { recipeId: recipe.id },
        });

        return {
          ...normalizeRecipeForRead(recipe),
          averageRating: ratingStats.average,
          commentsCount,
          hasBeenEditedByAdmin: hasEditHistory > 0,
        };
      }),
    );

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * User updates their own submitted recipe
   */
  async updateUserSubmission(
    userId: string,
    recipeId: string,
    dto: CreateRecipeDto,
  ) {
    const recipe = await this.recipeRepo.findOne({
      where: { id: recipeId, submittedBy: userId },
    });
    if (!recipe)
      throw new NotFoundException('Không tìm thấy công thức của bạn');

    const { ingredients, steps, ...scalarData } = dto;
    const recipeData = normalizeRecipeScalarData(scalarData);
    const normalizedSteps = normalizeRecipeSteps(steps);
    const normalizedIngredients = normalizeRecipeIngredients(ingredients);

    Object.assign(recipe, recipeData, { steps: normalizedSteps });
    // Reset status to pending so it goes through moderation again
    recipe.status = 'pending';
    recipe.rejectionReason = null;
    await this.recipeRepo.save(recipe);

    // Re-link ingredients if provided
    if (ingredients !== undefined) {
      await this.riRepo.delete({ recipeId });
      if (normalizedIngredients.length) {
        await this.linkIngredients(recipeId, normalizedIngredients);
      }
    }

    // Clear cached audit so it triggers a new AI audit
    await this.auditRepo.delete({ recipeId });

    return {
      message: 'Đã cập nhật công thức thành công và đang chờ duyệt lại',
      recipe,
    };
  }

  /**
   * User deletes their own submitted recipe
   */
  async deleteUserSubmission(userId: string, recipeId: string) {
    const recipe = await this.recipeRepo.findOne({
      where: { id: recipeId, submittedBy: userId },
    });
    if (!recipe)
      throw new NotFoundException('Không tìm thấy công thức của bạn');

    await this.recipeRepo.remove(recipe);
    return { message: 'Đã xóa công thức thành công' };
  }

  /**
   * Resubmit a rejected recipe
   */
  async resubmitRecipe(userId: string, recipeId: string) {
    const recipe = await this.recipeRepo.findOne({
      where: { id: recipeId, submittedBy: userId },
    });
    if (!recipe)
      throw new NotFoundException('Không tìm thấy công thức của bạn');
    if (recipe.status !== 'rejected') {
      throw new ForbiddenException(
        'Chỉ có công thức bị từ chối mới có thể gửi lại để duyệt',
      );
    }

    recipe.status = 'pending';
    recipe.rejectionReason = null;
    await this.recipeRepo.save(recipe);

    // Clear cached audit so it triggers a new AI audit
    await this.auditRepo.delete({ recipeId });

    return { message: 'Đã gửi lại công thức để duyệt', recipe };
  }

  // ==================== ADMIN: STATS ====================

  async getStats() {
    const [totalRecipes, pendingCount, approvedCount, rejectedCount] =
      await Promise.all([
        this.recipeRepo.count(),
        this.recipeRepo.count({ where: { status: 'pending' } }),
        this.recipeRepo.count({ where: { status: 'approved' } }),
        this.recipeRepo.count({ where: { status: 'rejected' } }),
      ]);

    return {
      totalRecipes,
      pendingCount,
      approvedCount,
      rejectedCount,
    };
  }

  async editPendingRecipe(id: string, dto: CreateRecipeDto, adminId: string) {
    const recipe = await this.recipeRepo.findOne({
      where: { id },
      relations: [
        'recipeIngredients',
        'recipeIngredients.ingredient',
        'submitter',
      ],
    });
    if (!recipe) throw new NotFoundException('Không tìm thấy công thức');

    // 1. Serialize old values
    const oldName = recipe.name;
    const oldDesc = recipe.description || 'Không có';
    const oldCalories = `${recipe.calories} kcal`;
    const oldProtein = `${Number(recipe.protein || 0)}g`;
    const oldCarbs = `${Number(recipe.carbs || 0)}g`;
    const oldFat = `${Number(recipe.fat || 0)}g`;
    const oldImageUrl = recipe.imageUrl || 'Không có';
    const oldSteps =
      recipe.steps?.map((s) => `Bước ${s.step}: ${s.description}`).join('\n') ||
      'Không có';
    const oldIngredients =
      recipe.recipeIngredients
        ?.map(
          (ri) =>
            `${ri.quantity}${ri.unit} ${ri.ingredient?.name || ''}${ri.isOptional ? ' (tùy chọn)' : ''}`,
        )
        .join('\n') || 'Không có';

    // 2. Perform updates
    const { ingredients, steps, ...scalarData } = dto;
    const recipeData = normalizeRecipeScalarData(scalarData);
    const normalizedSteps = normalizeRecipeSteps(steps);
    const normalizedIngredients = normalizeRecipeIngredients(ingredients);

    Object.assign(recipe, recipeData, { steps: normalizedSteps });

    recipe.status = 'pending';
    recipe.rejectionReason = null;
    await this.recipeRepo.save(recipe);

    // Re-link ingredients
    if (ingredients !== undefined) {
      await this.riRepo.delete({ recipeId: id });
      if (normalizedIngredients.length > 0) {
        await this.linkIngredients(id, normalizedIngredients);
      }
    }

    // Fetch updated recipe with new ingredients to get serializable new values
    const updatedRecipe = await this.recipeRepo.findOne({
      where: { id },
      relations: ['recipeIngredients', 'recipeIngredients.ingredient'],
    });

    // 3. Serialize new values
    const newName = updatedRecipe.name;
    const newDesc = updatedRecipe.description || 'Không có';
    const newCalories = `${updatedRecipe.calories} kcal`;
    const newProtein = `${Number(updatedRecipe.protein || 0)}g`;
    const newCarbs = `${Number(updatedRecipe.carbs || 0)}g`;
    const newFat = `${Number(updatedRecipe.fat || 0)}g`;
    const newImageUrl = updatedRecipe.imageUrl || 'Không có';
    const newSteps =
      updatedRecipe.steps
        ?.map((s) => `Bước ${s.step}: ${s.description}`)
        .join('\n') || 'Không có';
    const newIngredients =
      updatedRecipe.recipeIngredients
        ?.map(
          (ri) =>
            `${ri.quantity}${ri.unit} ${ri.ingredient?.name || ''}${ri.isOptional ? ' (tùy chọn)' : ''}`,
        )
        .join('\n') || 'Không có';

    // 4. Compare and log history
    const changes: { field: string; oldValue: string; newValue: string }[] = [];
    if (oldName !== newName)
      changes.push({ field: 'Tên món', oldValue: oldName, newValue: newName });
    if (oldDesc !== newDesc)
      changes.push({ field: 'Mô tả', oldValue: oldDesc, newValue: newDesc });
    if (oldCalories !== newCalories)
      changes.push({
        field: 'Calories',
        oldValue: oldCalories,
        newValue: newCalories,
      });
    if (oldProtein !== newProtein)
      changes.push({
        field: 'Protein',
        oldValue: oldProtein,
        newValue: newProtein,
      });
    if (oldCarbs !== newCarbs)
      changes.push({ field: 'Carbs', oldValue: oldCarbs, newValue: newCarbs });
    if (oldFat !== newFat)
      changes.push({ field: 'Fat', oldValue: oldFat, newValue: newFat });
    if (oldImageUrl !== newImageUrl)
      changes.push({
        field: 'Ảnh',
        oldValue: oldImageUrl,
        newValue: newImageUrl,
      });
    if (oldSteps !== newSteps)
      changes.push({
        field: 'Các bước thực hiện',
        oldValue: oldSteps,
        newValue: newSteps,
      });
    if (oldIngredients !== newIngredients)
      changes.push({
        field: 'Nguyên liệu',
        oldValue: oldIngredients,
        newValue: newIngredients,
      });

    if (changes.length > 0) {
      // Save history log
      const history = this.editHistoryRepo.create({
        recipeId: id,
        editedBy: adminId,
        changes,
      });
      await this.editHistoryRepo.save(history);

      // Send notification to creator
      if (recipe.submittedBy) {
        await this.notificationService.createNotification(
          recipe.submittedBy,
          adminId,
          recipe.id,
          'EDITED',
          'Quản trị viên đã chỉnh sửa một số nội dung trong công thức của bạn trước khi xuất bản.',
          'Bài viết đã được chỉnh sửa',
        );

        // Send email
        if (recipe.submitter?.email) {
          const changesListHtml = changes
            .map(
              (c) => `
                        <div style="margin-bottom: 15px; border-left: 3px solid #3b82f6; padding-left: 10px;">
                            <p style="margin: 0 0 5px 0; font-weight: bold; color: #4b5563;">${c.field}:</p>
                            <pre style="background: #fee2e2; color: #b91c1c; padding: 8px 12px; border-radius: 6px; margin: 0 0 4px 0; font-family: monospace; white-space: pre-wrap; font-size: 13px;">- ${c.oldValue}</pre>
                            <pre style="background: #d1fae5; color: #047857; padding: 8px 12px; border-radius: 6px; margin: 0; font-family: monospace; white-space: pre-wrap; font-size: 13px;">+ ${c.newValue}</pre>
                        </div>
                    `,
            )
            .join('');

          const subject = 'Bài viết đã được chỉnh sửa - AI Meal Planner';
          const html = `
                      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
                        <h2 style="color: #3b82f6; text-align: center; margin-top: 0;">Bài Viết Đã Được Chỉnh Sửa</h2>
                        <p>Chào bạn,</p>
                        <p>Quản trị viên đã chỉnh sửa một số nội dung trong công thức <strong>${recipe.name}</strong> của bạn trước khi xuất bản.</p>
                        <p><strong>Danh sách thay đổi:</strong></p>
                        <div style="margin: 20px 0;">
                          ${changesListHtml}
                        </div>
                        <p>Bạn có thể xem chi tiết sự thay đổi này trên ứng dụng.</p>
                        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
                        <p style="font-size: 12px; color: #6b7280; text-align: center;">Đây là email tự động từ hệ thống AI Meal Planner. Vui lòng không phản hồi lại email này.</p>
                      </div>
                    `;
          await this.emailService.sendMail(
            recipe.submitter.email,
            subject,
            html,
          );
        }
      }

      // Clear cached audit so it triggers a new AI audit
      await this.auditRepo.delete({ recipeId: id });
    }

    return {
      message: 'Recipe edited successfully',
      recipe: updatedRecipe,
      changes,
    };
  }

  async getEditHistory(recipeId: string, userId: string, role: string) {
    const recipe = await this.recipeRepo.findOne({ where: { id: recipeId } });
    if (!recipe) {
      throw new NotFoundException('Không tìm thấy công thức');
    }
    if (role !== 'admin' && recipe.submittedBy !== userId) {
      throw new ForbiddenException(
        'Bạn không có quyền xem lịch sử chỉnh sửa của công thức này',
      );
    }
    return await this.editHistoryRepo.find({
      where: { recipeId },
      relations: ['editor'],
      order: { createdAt: 'DESC' },
    });
  }

  // ==================== HELPERS ====================

  private async linkIngredients(
    recipeId: string,
    ingredients: {
      name: string;
      quantity: number;
      unit: string;
      isOptional?: boolean;
    }[],
  ) {
    for (const ing of ingredients) {
      // Find or create ingredient
      let ingredient = await this.ingredientRepo.findOne({
        where: { name: ing.name },
      });

      if (!ingredient) {
        ingredient = this.ingredientRepo.create({
          name: ing.name,
          category: 'khac',
          defaultUnit: ing.unit,
          caloriesPer100g: 0,
          proteinPer100g: 0,
          carbsPer100g: 0,
          fatPer100g: 0,
        });
        await this.ingredientRepo.save(ingredient);
      }

      const ri = this.riRepo.create({
        recipeId,
        ingredientId: ingredient.id,
        quantity: ing.quantity,
        unit: ing.unit,
        isOptional: ing.isOptional || false,
      });
      await this.riRepo.save(ri);
    }
  }

  private async recordRecipeView(
    recipeId: string,
    userId?: string,
    viewerKey?: string,
    userAgent?: string | null,
  ) {
    if (!viewerKey) return;

    const since = new Date(Date.now() - this.viewCooldownMs);
    const recentViews = await this.viewRepo.count({
      where: {
        recipeId,
        viewerKey,
        createdAt: MoreThan(since),
      },
    });

    if (recentViews > 0) return;

    await this.viewRepo.save(
      this.viewRepo.create({
        recipeId,
        userId: userId || null,
        viewerKey,
        userAgent: userAgent ? userAgent.slice(0, 255) : null,
      }),
    );

    await this.recipeRepo.increment({ id: recipeId }, 'views', 1);
  }

  private async getRecipeViewCount(recipeId: string, legacyViews: number) {
    const trackedViews = await this.viewRepo.count({ where: { recipeId } });
    return Math.max(legacyViews, trackedViews);
  }

  private assertFavoriteInput(userId?: string, recipeId?: string) {
    if (!userId) {
      throw new BadRequestException('Missing authenticated user');
    }

    if (!recipeId) {
      throw new BadRequestException('Missing recipeId');
    }
  }

  private async migrateLegacyFavoritesTable() {
    try {
      await this.favoriteRepo.manager.query(`
                INSERT INTO "favorite_recipes" ("userId", "recipeId", "createdAt")
                SELECT f."userId", f."recipeId", MIN(f."createdAt")
                FROM "favorites" f
                LEFT JOIN "favorite_recipes" fr
                    ON fr."userId" = f."userId"
                    AND fr."recipeId" = f."recipeId"
                WHERE fr."id" IS NULL
                GROUP BY f."userId", f."recipeId"
            `);
    } catch {
      // Fresh databases only have favorite_recipes.
    }
  }
}
