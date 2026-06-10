import { Injectable, NotFoundException, ForbiddenException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Recipe } from './entities/recipe.entity';
import { Favorite } from './entities/favorite.entity';
import { Ingredient } from './entities/ingredient.entity';
import { RecipeIngredient } from './entities/recipe-ingredient.entity';
import { RecipeRating } from './entities/recipe-rating.entity';
import { RecipeRatingService } from './recipe-rating.service';
import { CreateRecipeDto } from './dto/create-recipe.dto';
import { RecipeView } from './entities/recipe-view.entity';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class RecipesService implements OnModuleInit {
    private readonly viewCooldownMs = 6 * 60 * 60 * 1000;

    constructor(
        @InjectRepository(Recipe) private recipeRepo: Repository<Recipe>,
        @InjectRepository(Favorite) private favoriteRepo: Repository<Favorite>,
        @InjectRepository(Ingredient) private ingredientRepo: Repository<Ingredient>,
        @InjectRepository(RecipeIngredient) private riRepo: Repository<RecipeIngredient>,
        @InjectRepository(RecipeView) private viewRepo: Repository<RecipeView>,
        private readonly ratingService: RecipeRatingService,
        private readonly notificationService: NotificationService,
    ) { }

    async onModuleInit() {
        await this.migrateLikesToFavorites();
    }

    /**
     * List recipes with search, filtering, and pagination
     * Only shows approved recipes by default
     */
    async findAll(query: {
        page?: number;
        limit?: number;
        search?: string;
        tags?: string[];
        mealType?: string;
        maxCookingTime?: number;
        minCalories?: number;
        maxCalories?: number;
        region?: string;
        sort?: string;
        status?: string; // Admin can filter by status
    }, currentUserId?: string) {
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
            qb.andWhere(':mealType = ANY(string_to_array(recipe.mealType, \',\'))', {
                mealType: query.mealType,
            });
        }

        // Filter by cooking time
        if (query.maxCookingTime) {
            qb.andWhere('recipe.cookingTime <= :maxTime', { maxTime: query.maxCookingTime });
        }

        // Filter by calorie range
        if (query.minCalories) {
            qb.andWhere('recipe.calories >= :minCal', { minCal: query.minCalories });
        }
        if (query.maxCalories) {
            qb.andWhere('recipe.calories <= :maxCal', { maxCal: query.maxCalories });
        }

        // Filter by region
        if (query.region) {
            qb.andWhere('recipe.cuisineRegion = :region', { region: query.region });
        }

        // Sort
        const sortField = query.sort || 'createdAt';
        qb.orderBy(`recipe.${sortField}`, 'DESC');

        qb
            .addSelect((subQuery) => subQuery
                .select('COALESCE(ROUND(AVG(rating.rating)::numeric, 1), 0)')
                .from(RecipeRating, 'rating')
                .where('rating.recipeId = recipe.id')
                .andWhere('rating.parentId IS NULL')
                .andWhere('rating.rating IS NOT NULL')
                .andWhere('rating.moderationStatus = :reviewedStatus'),
                'averageRating',
            )
            .addSelect((subQuery) => subQuery
                .select('COUNT(*)')
                .from(RecipeRating, 'rating')
                .where('rating.recipeId = recipe.id')
                .andWhere('rating.parentId IS NULL')
                .andWhere('rating.rating IS NOT NULL')
                .andWhere('rating.moderationStatus = :reviewedStatus'),
                'reviewCount',
            )
            .addSelect((subQuery) => subQuery
                .select('COUNT(*)')
                .from(Favorite, 'favorite')
                .where('favorite.recipeId = recipe.id'),
                'favoriteCount',
            )
            .addSelect((subQuery) => subQuery
                .select('GREATEST(COALESCE(recipe.views, 0), COUNT(recipeView.id))')
                .from(RecipeView, 'recipeView')
                .where('recipeView.recipeId = recipe.id'),
                'viewCount',
            )
            .setParameter('reviewedStatus', 'reviewed');

        if (currentUserId) {
            qb
                .addSelect((subQuery) => subQuery
                    .select('COUNT(*)')
                    .from(Favorite, 'userFavorite')
                    .where('userFavorite.recipeId = recipe.id')
                    .andWhere('userFavorite.userId = :currentUserId'),
                    'isFavoriteCount',
                )
                .setParameter('currentUserId', currentUserId);
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
                    averageRating: Number(parseFloat(row.averageRating ?? row.averagerating ?? '0').toFixed(1)),
                    reviewCount: Number(row.reviewCount ?? row.reviewcount ?? 0),
                    favoriteCount: Number(row.favoriteCount ?? row.favoritecount ?? 0),
                    viewCount: Number(row.viewCount ?? row.viewcount ?? 0),
                    isFavorite: Number(row.isFavoriteCount ?? row.isfavoritecount ?? 0) > 0,
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

    /**
     * Get full recipe details with ingredients and steps
     */
    async findOne(
        id: string,
        options?: { userId?: string; viewerKey?: string; userAgent?: string | null },
    ) {
        const recipe = await this.recipeRepo.findOne({
            where: { id },
            relations: ['recipeIngredients', 'recipeIngredients.ingredient', 'submitter'],
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
            const fav = await this.favoriteRepo.findOne({ where: { userId: options.userId, recipeId: id } });
            isFavorite = !!fav;
        }

        const [ratingStats, favoriteCount, viewCount] = await Promise.all([
            this.ratingService.getAverageRatingForRecipe(id),
            this.favoriteRepo.count({ where: { recipeId: id } }),
            this.getRecipeViewCount(id, recipe.views || 0),
        ]);

        return {
            ...recipe,
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
     * Toggle favorite on a recipe
     */
    async toggleFavorite(userId: string, recipeId: string) {
        const existing = await this.favoriteRepo.findOne({
            where: { userId, recipeId },
        });

        const recipe = await this.recipeRepo.findOne({ where: { id: recipeId } });
        if (!recipe) throw new NotFoundException('Recipe not found');

        if (existing) {
            await this.favoriteRepo.remove(existing);
            const favoriteCount = await this.favoriteRepo.count({ where: { recipeId } });
            return {
                isFavorite: false,
                isFavorited: false,
                favoriteCount,
                message: 'Recipe removed from favorites',
            };
        }

        const favorite = this.favoriteRepo.create({ userId, recipeId });
        await this.favoriteRepo.save(favorite);

        // Send notification if not self-action
        if (recipe.submittedBy) {
            await this.notificationService.createNotification(
                recipe.submittedBy,
                userId,
                recipeId,
                'SAVE_RECIPE',
                'Có người vừa lưu công thức bạn chia sẻ.'
            );
        }

        const favoriteCount = await this.favoriteRepo.count({ where: { recipeId } });
        return {
            isFavorite: true,
            isFavorited: true,
            favoriteCount,
            message: 'Recipe added to favorites',
        };
    }

    /**
     * Get user's favorited recipes with pagination, search, and category stats
     */
    async getFavorites(userId: string, query?: { page?: number; limit?: number; search?: string; category?: string }) {
        const page = Number(query?.page) || 1;
        const limit = Number(query?.limit) || 8;

        const qb = this.favoriteRepo
            .createQueryBuilder('favorite')
            .innerJoinAndSelect('favorite.recipe', 'recipe')
            .where('favorite.userId = :userId', { userId });

        if (query?.search) {
            qb.andWhere('LOWER(recipe.name) LIKE LOWER(:search)', { search: `%${query.search}%` });
        }

        if (query?.category) {
            qb.andWhere('recipe.cuisineRegion = :category', { category: query.category });
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
        const { ingredients, ...recipeData } = dto;

        const recipe = this.recipeRepo.create({
            ...recipeData,
            status: 'approved',
            submittedBy: adminId,
        });
        await this.recipeRepo.save(recipe);

        // Link ingredients
        if (ingredients?.length) {
            await this.linkIngredients(recipe.id, ingredients);
        }

        return { message: 'Recipe created', recipe };
    }

    /**
     * Admin updates a recipe
     */
    async adminUpdate(id: string, dto: CreateRecipeDto) {
        const recipe = await this.recipeRepo.findOne({ where: { id } });
        if (!recipe) throw new NotFoundException('Recipe not found');

        const { ingredients, ...recipeData } = dto;
        Object.assign(recipe, recipeData);
        await this.recipeRepo.save(recipe);

        // Re-link ingredients if provided
        if (ingredients?.length) {
            await this.riRepo.delete({ recipeId: id });
            await this.linkIngredients(id, ingredients);
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
            relations: ['submitter'],
            order: { createdAt: 'ASC' },
            skip: (page - 1) * limit,
            take: limit,
        });

        return {
            data: data.map((r) => ({
                ...r,
                submitterName: r.submitter?.fullName || 'Unknown',
                submitterEmail: r.submitter?.email || '',
                submitter: undefined,
            })),
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
    }

    /**
     * Admin approves a pending recipe
     */
    async approve(id: string) {
        const recipe = await this.recipeRepo.findOne({ where: { id } });
        if (!recipe) throw new NotFoundException('Recipe not found');
        if (recipe.status !== 'pending') {
            throw new ForbiddenException('Only pending recipes can be approved');
        }

        recipe.status = 'approved';
        recipe.rejectionReason = null;
        await this.recipeRepo.save(recipe);
        return { message: 'Recipe approved', recipe };
    }

    /**
     * Admin rejects a pending recipe
     */
    async reject(id: string, reason: string) {
        const recipe = await this.recipeRepo.findOne({ where: { id } });
        if (!recipe) throw new NotFoundException('Recipe not found');
        if (recipe.status !== 'pending') {
            throw new ForbiddenException('Only pending recipes can be rejected');
        }

        recipe.status = 'rejected';
        recipe.rejectionReason = reason;
        await this.recipeRepo.save(recipe);
        return { message: 'Recipe rejected', recipe };
    }

    // ==================== USER: SUBMIT RECIPE ====================

    /**
     * User submits a recipe for admin review (pending status)
     */
    async userSubmit(dto: CreateRecipeDto, userId: string) {
        const { ingredients, ...recipeData } = dto;

        const recipe = this.recipeRepo.create({
            ...recipeData,
            status: 'pending',
            submittedBy: userId,
        });
        await this.recipeRepo.save(recipe);

        if (ingredients?.length) {
            await this.linkIngredients(recipe.id, ingredients);
        }

        return { message: 'Recipe submitted for review', recipe };
    }

    /**
     * Get user's submitted recipes with pagination, average rating, and comment counts
     */
    async getUserSubmissions(userId: string, query?: { page?: number; limit?: number; status?: string }) {
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

        const data = await Promise.all(recipes.map(async (recipe) => {
            const ratingStats = await this.ratingService.getAverageRatingForRecipe(recipe.id);
            const commentsCount = await this.recipeRepo.manager
                .getRepository(RecipeRating)
                .count({
                    where: { recipeId: recipe.id, moderationStatus: 'reviewed' }
                });

            return {
                ...recipe,
                averageRating: ratingStats.average,
                commentsCount,
            };
        }));

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
    async updateUserSubmission(userId: string, recipeId: string, dto: CreateRecipeDto) {
        const recipe = await this.recipeRepo.findOne({
            where: { id: recipeId, submittedBy: userId }
        });
        if (!recipe) throw new NotFoundException('Không tìm thấy công thức của bạn');

        const { ingredients, ...recipeData } = dto;
        Object.assign(recipe, recipeData);
        // Reset status to pending so it goes through moderation again
        recipe.status = 'pending';
        recipe.rejectionReason = null;
        await this.recipeRepo.save(recipe);

        // Re-link ingredients if provided
        if (ingredients?.length) {
            await this.riRepo.delete({ recipeId });
            await this.linkIngredients(recipeId, ingredients);
        }

        return { message: 'Đã cập nhật công thức thành công và đang chờ duyệt lại', recipe };
    }

    /**
     * User deletes their own submitted recipe
     */
    async deleteUserSubmission(userId: string, recipeId: string) {
        const recipe = await this.recipeRepo.findOne({
            where: { id: recipeId, submittedBy: userId }
        });
        if (!recipe) throw new NotFoundException('Không tìm thấy công thức của bạn');

        await this.recipeRepo.remove(recipe);
        return { message: 'Đã xóa công thức thành công' };
    }

    /**
     * Resubmit a rejected recipe
     */
    async resubmitRecipe(userId: string, recipeId: string) {
        const recipe = await this.recipeRepo.findOne({
            where: { id: recipeId, submittedBy: userId }
        });
        if (!recipe) throw new NotFoundException('Không tìm thấy công thức của bạn');
        if (recipe.status !== 'rejected') {
            throw new ForbiddenException('Chỉ có công thức bị từ chối mới có thể gửi lại để duyệt');
        }

        recipe.status = 'pending';
        recipe.rejectionReason = null;
        await this.recipeRepo.save(recipe);
        return { message: 'Đã gửi lại công thức để duyệt', recipe };
    }

    // ==================== ADMIN: STATS ====================

    async getStats() {
        const [totalRecipes, pendingCount, approvedCount, rejectedCount] = await Promise.all([
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

    // ==================== HELPERS ====================

    private async linkIngredients(
        recipeId: string,
        ingredients: { name: string; quantity: number; unit: string; isOptional?: boolean }[],
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
                    averagePrice: 0,
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

        await this.viewRepo.save(this.viewRepo.create({
            recipeId,
            userId: userId || null,
            viewerKey,
            userAgent: userAgent ? userAgent.slice(0, 255) : null,
        }));

        await this.recipeRepo.increment({ id: recipeId }, 'views', 1);
    }

    private async getRecipeViewCount(recipeId: string, legacyViews: number) {
        const trackedViews = await this.viewRepo.count({ where: { recipeId } });
        return Math.max(legacyViews, trackedViews);
    }

    private async migrateLikesToFavorites() {
        try {
            await this.favoriteRepo.manager.query(`
                INSERT INTO "favorites" ("userId", "recipeId", "createdAt")
                SELECT rl."userId", rl."recipeId", MIN(rl."createdAt")
                FROM "recipe_likes" rl
                LEFT JOIN "favorites" f
                    ON f."userId" = rl."userId"
                    AND f."recipeId" = rl."recipeId"
                WHERE f."id" IS NULL
                GROUP BY rl."userId", rl."recipeId"
            `);
        } catch {
            // New installations may not have the legacy recipe_likes table.
        }
    }
}
