import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Recipe } from './entities/recipe.entity';
import { Favorite } from './entities/favorite.entity';
import { Ingredient } from './entities/ingredient.entity';
import { RecipeIngredient } from './entities/recipe-ingredient.entity';
import { RecipeRating } from './entities/recipe-rating.entity';
import { RecipeRatingService } from './recipe-rating.service';
import { CreateRecipeDto } from './dto/create-recipe.dto';
import { RecipeLike } from './entities/recipe-like.entity';
import { User } from '../auth/entities/user.entity';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class RecipesService {
    constructor(
        @InjectRepository(Recipe) private recipeRepo: Repository<Recipe>,
        @InjectRepository(Favorite) private favoriteRepo: Repository<Favorite>,
        @InjectRepository(Ingredient) private ingredientRepo: Repository<Ingredient>,
        @InjectRepository(RecipeIngredient) private riRepo: Repository<RecipeIngredient>,
        @InjectRepository(RecipeLike) private likeRepo: Repository<RecipeLike>,
        @InjectRepository(User) private userRepo: Repository<User>,
        private readonly ratingService: RecipeRatingService,
        private readonly notificationService: NotificationService,
    ) { }

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
    }) {
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

        // Pagination
        const [data, total] = await qb
            .skip((page - 1) * limit)
            .take(limit)
            .getManyAndCount();

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
     * Get full recipe details with ingredients and steps
     */
    async findOne(id: string, userId?: string) {
        const recipe = await this.recipeRepo.findOne({
            where: { id },
            relations: ['recipeIngredients', 'recipeIngredients.ingredient', 'submitter'],
        });

        if (!recipe) throw new NotFoundException('Recipe not found');

        // Increment view count
        recipe.views = (recipe.views || 0) + 1;
        await this.recipeRepo.save(recipe);

        // Check if favorited by current user
        let isFavorited = false;
        let isLiked = false;
        if (userId) {
            const [fav, like] = await Promise.all([
                this.favoriteRepo.findOne({ where: { userId, recipeId: id } }),
                this.likeRepo.findOne({ where: { userId, recipeId: id } }),
            ]);
            isFavorited = !!fav;
            isLiked = !!like;
        }

        // Fetch rating stats
        const ratingStats = await this.ratingService.getAverageRatingForRecipe(id);

        return {
            ...recipe,
            ingredients: recipe.recipeIngredients.map((ri) => ({
                id: ri.ingredient.id,
                name: ri.ingredient.name,
                quantity: ri.quantity,
                unit: ri.unit,
                isOptional: ri.isOptional,
            })),
            isFavorited,
            isLiked,
            averageRating: ratingStats.average,
            totalRatings: ratingStats.count,
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
            return { isFavorited: false, message: 'Recipe removed from favorites' };
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

        return { isFavorited: true, message: 'Recipe added to favorites' };
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

    /**
     * Toggle like on a recipe
     */
    async toggleLike(userId: string, recipeId: string) {
        const recipe = await this.recipeRepo.findOne({ where: { id: recipeId } });
        if (!recipe) throw new NotFoundException('Không tìm thấy công thức món ăn.');

        const existing = await this.likeRepo.findOne({
            where: { userId, recipeId },
        });

        if (existing) {
            await this.likeRepo.remove(existing);
            return { isLiked: false, message: 'Đã bỏ thích công thức món ăn.' };
        }

        const like = this.likeRepo.create({ userId, recipeId });
        await this.likeRepo.save(like);

        // Send notification if not self-action
        if (recipe.submittedBy) {
            const actor = await this.userRepo.findOne({ where: { id: userId } });
            const actorName = actor?.fullName || 'Ai đó';
            await this.notificationService.createNotification(
                recipe.submittedBy,
                userId,
                recipeId,
                'LIKE_POST',
                `${actorName} đã thích bài viết của bạn.`
            );
        }

        return { isLiked: true, message: 'Đã thích công thức món ăn.' };
    }
}
