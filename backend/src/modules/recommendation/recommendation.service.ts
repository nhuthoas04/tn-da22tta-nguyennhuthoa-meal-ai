import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Recipe } from '../recipes/entities/recipe.entity';
import { RecipeIngredient } from '../recipes/entities/recipe-ingredient.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import { User } from '../auth/entities/user.entity';
import { UserPreference } from '../auth/entities/user-preference.entity';
import { Favorite } from '../recipes/entities/favorite.entity';
import { CalorieService } from './calorie.service';
import { UserActionLog } from '../chatbot/entities/user-action-log.entity';
import { MealPlanItem } from '../meal-plan/entities/meal-plan-item.entity';

type RecommendationOptions = {
  excludeIds?: string[];
  excludeNames?: string[];
  currentDayRecipeIds?: string[];
  currentDayRecipeNames?: string[];
  currentDayTags?: string[];
  recentSuggestedNames?: string[];
  recentSuggestedRecipeIds?: string[];
  preferNewRecipes?: boolean;
  avoidRepeatLast7Days?: boolean;
  prioritizeNew?: boolean;
  noRepeatIn7Days?: boolean;
  weeklyUsedRecipeIds?: string[];
  previousDayRecipeIds?: string[];
  targetDate?: string;
  mealTargetCalories?: number;
  currentMealCalories?: number;
  remainingMealCalories?: number;
  options?: {
    preferNewRecipes?: boolean;
    avoidRepeatLast7Days?: boolean;
  };
};

/**
 * Smart Recommendation Engine
 *
 * Uses a hybrid scoring system with 5 weighted dimensions:
 *   Score = 0.35×IngredientMatch + 0.25×WasteReduction
 *         + 0.20×PreferenceMatch + 0.10×CookTimeScore
 *         + 0.10×NutritionScore
 */
@Injectable()
export class RecommendationService {
  // Scoring weights (must sum to 1.0)
  private readonly WEIGHTS = {
    nutritionHealth: 0.25,
    ingredientMatch: 0.20,
    wasteReduction: 0.15,
    preferenceMatch: 0.15,
    cookTimeScore: 0.10,
    caloriesScore: 0.15,
  };

  // Anti-waste urgency tiers based on days until expiration
  private readonly URGENCY_WEIGHTS: Record<string, number> = {
    critical: 1.0, // 0-1 days
    high: 0.8, // 2-3 days
    medium: 0.5, // 4-5 days
    low: 0.3, // 6-7 days
  };

  constructor(
    @InjectRepository(Recipe) private recipeRepo: Repository<Recipe>,
    @InjectRepository(RecipeIngredient)
    private riRepo: Repository<RecipeIngredient>,
    @InjectRepository(Inventory) private inventoryRepo: Repository<Inventory>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(UserPreference)
    private prefRepo: Repository<UserPreference>,
    @InjectRepository(Favorite) private favoriteRepo: Repository<Favorite>,
    @InjectRepository(UserActionLog)
    private actionLogRepo: Repository<UserActionLog>,
    @InjectRepository(MealPlanItem)
    private mealPlanItemRepo: Repository<MealPlanItem>,
    private calorieService: CalorieService,
  ) { }

  /**
   * Main recommendation endpoint
   * Returns scored and ranked recipes for a given meal type
   */
  async getRecommendations(
    userId: string,
    mealType: string,
    limit: number = 5,
    useAntiWaste: boolean = true,
    options: RecommendationOptions = {},
  ) {
    const aiOptions = this.normalizeAiOptions(options);
    console.log('[MealAI][recommendation] AI options:', aiOptions);

    // Load user context
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['preferences'],
    });
    const preferences = user.preferences;
    const inventory = await this.inventoryRepo.find({
      where: { userId },
      relations: ['ingredient'],
    });
    const userActionLogs = await this.actionLogRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 100,
    });

    // Calculate calorie targets
    const calorieTarget = this.calorieService.getMealDistribution(
      user.dailyCalorieTarget,
    );
    const targetForMeal = options.mealTargetCalories !== undefined && options.mealTargetCalories !== null
      ? Number(options.mealTargetCalories)
      : (calorieTarget ? calorieTarget[mealType] || 700 : 700);

    const currentMealCalories = options.currentMealCalories !== undefined && options.currentMealCalories !== null
      ? Number(options.currentMealCalories)
      : 0;

    const remainingMealCalories = options.remainingMealCalories !== undefined && options.remainingMealCalories !== null
      ? Number(options.remainingMealCalories)
      : Math.max(0, targetForMeal - currentMealCalories);

    // Get user's favorited recipe IDs for preference scoring
    const favorites = await this.favoriteRepo.find({ where: { userId } });
    const favRecipeIds = new Set(favorites.map((f) => f.recipeId));
    const mealPlanHistory = await this.getMealPlanHistory(userId, options.targetDate);
    const occurrenceByRecipeId = mealPlanHistory.occurrenceByRecipeId;
    const recentRecipeIds = new Set([
      ...mealPlanHistory.recentRecipeIds,
      ...((options.weeklyUsedRecipeIds || []) as string[]),
    ]);

    // ========== STAGE 1: PRE-FILTER ==========
    let recipes = await this.recipeRepo.find({
      where: { isActive: true, status: 'approved' },
      relations: ['recipeIngredients', 'recipeIngredients.ingredient'],
    });

    const excludeIds = new Set(options?.excludeIds || []);
    const excludeNames = options?.excludeNames;
    if (excludeNames && excludeNames.length > 0) {
      recipes = recipes.filter((r) => !excludeNames.includes(r.name));
    }

    // Filter by meal type
    recipes = recipes.filter(
      (r) => r.mealType && r.mealType.includes(mealType),
    );

    // Filter out excluded recipe IDs only when enough alternatives remain for this meal type.
    if (excludeIds.size > 0) {
      const nonExcludedRecipes = recipes.filter((r) => !excludeIds.has(r.id));
      const minimumFallbackPoolSize = Math.min(5, recipes.length);
      if (nonExcludedRecipes.length >= minimumFallbackPoolSize) {
        recipes = nonExcludedRecipes;
      } else {
        console.log(
          '[MealAI][recommendation] Not enough recipes to fully exclude current/recent suggestions; using penalty fallback.',
        );
      }
    }

    // Filter by dietary restrictions
    if (preferences?.dietType === 'vegetarian') {
      recipes = recipes.filter((r) => r.tags?.includes('chay'));
    } else if (preferences?.dietType === 'keto') {
      recipes = recipes.filter(
        (r) =>
          r.tags?.includes('keto') ||
          (Number(r.carbs) <= 15 && Number(r.fat) >= 10),
      );
    } else if (
      preferences?.dietType === 'lowcarb' ||
      preferences?.dietType === 'low_carb'
    ) {
      recipes = recipes.filter(
        (r) =>
          r.tags?.includes('lowcarb') ||
          r.tags?.includes('low carb') ||
          Number(r.carbs) <= 30,
      );
    }

    // Filter by max cooking time
    if (preferences?.maxCookingTime && Number(preferences.maxCookingTime) > 0) {
      recipes = recipes.filter(
        (r) => r.cookingTime <= Number(preferences.maxCookingTime),
      );
    }

    // Filter by budget
    if (preferences?.budgetPerMeal && Number(preferences.budgetPerMeal) > 0) {
      recipes = recipes.filter(
        (r) =>
          !r.estimatedCost ||
          r.estimatedCost <= Number(preferences.budgetPerMeal),
      );
    }

    // Filter out allergens (robust substring matching to avoid safety bugs)
    if (preferences?.allergies?.length) {
      recipes = recipes.filter((r) => {
        const ingredientNames =
          r.recipeIngredients?.map(
            (ri) => ri.ingredient?.name?.toLowerCase() || '',
          ) || [];
        return !preferences.allergies.some((allergen) => {
          const lowercaseAllergen = allergen.toLowerCase().trim();
          if (!lowercaseAllergen) return false;
          return ingredientNames.some((name) =>
            name.includes(lowercaseAllergen),
          );
        });
      });
    }

    if (aiOptions.avoidRepeatLast7Days && recentRecipeIds.size > 0) {
      const nonRecentRecipes = recipes.filter((r) => !recentRecipeIds.has(r.id));
      const minimumFallbackPoolSize = Math.min(10, recipes.length);
      if (nonRecentRecipes.length >= minimumFallbackPoolSize) {
        console.log(
          '[MealAI][recommendation] Filtering recipes used in last 7 days:',
          recipes.length - nonRecentRecipes.length,
        );
        recipes = nonRecentRecipes;
      } else {
        console.log(
          '[MealAI][recommendation] Not enough recipes to fully avoid last-7-day repeats; using penalty fallback.',
        );
      }
    }

    // Parse health conditions
    const healthConditions = preferences?.healthConditions
      ? preferences.healthConditions
        .split(',')
        .map((c) => c.trim().toLowerCase())
      : [];

    // 1.1. Diabetes Filter (Loại món ăn nhiều đường)
    if (healthConditions.includes('diabetes')) {
      const maxSugar = (preferences?.maxSugarPerMeal !== null && preferences?.maxSugarPerMeal !== undefined)
        ? Number(preferences.maxSugarPerMeal)
        : 5.0;
      recipes = recipes.filter(
        (r) => (r.sugar ? Number(r.sugar) : 0) <= maxSugar,
      );
    }

    // 1.2. Hypertension Filter (Loại món ăn nhiều muối/natri)
    if (healthConditions.includes('hypertension')) {
      const maxSodium = (preferences?.maxSodiumPerMeal !== null && preferences?.maxSodiumPerMeal !== undefined)
        ? Number(preferences.maxSodiumPerMeal)
        : 500.0;
      recipes = recipes.filter(
        (r) => (r.sodium ? Number(r.sodium) : 0) <= maxSodium,
      );
    }

    // 1.3. Weight Loss Calorie Limit Filter (Loại món vượt calorie mục tiêu bữa ăn 110%)
    if (
      healthConditions.includes('weight_loss') ||
      preferences?.dietType === 'weight_loss'
    ) {
      recipes = recipes.filter((r) => r.calories <= targetForMeal * 1.1);
    }

    // 1.4. Muscle Gain Protein Minimum Filter (Loại món không đáp ứng protein tối thiểu)
    if (healthConditions.includes('muscle_gain')) {
      const minProtein = (preferences?.minProteinPerMeal !== null && preferences?.minProteinPerMeal !== undefined)
        ? Number(preferences.minProteinPerMeal)
        : 25.0;
      recipes = recipes.filter((r) => Number(r.protein) >= minProtein);
    }

    // ========== STAGE 2: SCORING ==========
    const inventoryMap = new Map<string, Inventory>();
    inventory.forEach((inv) => inventoryMap.set(inv.ingredientId, inv));

    // Calculate expiring ingredients for anti-waste scoring
    const expiringItems = inventory.filter((inv) => {
      if (!inv.expirationDate) return false;
      const daysLeft = this.getDaysLeft(inv.expirationDate);
      return daysLeft <= 7 && daysLeft >= 0;
    });

    // Compute dynamic user habits scoring map
    const habitScores = this.applyHabitScoring(recipes, userActionLogs);

    const scored = recipes.map((recipe) => {
      const scores = {
        nutritionScore: this.scoreNutrition(recipe, targetForMeal),
        ingredientMatch: this.scoreIngredientMatch(recipe, inventoryMap),
        wasteReduction: useAntiWaste
          ? this.scoreWasteReduction(recipe, expiringItems)
          : 0,
        preferenceMatch: this.scorePreferenceMatch(
          recipe,
          preferences,
          favRecipeIds,
        ),
        cookTimeScore: this.scoreCookTime(
          recipe,
          preferences?.maxCookingTime || 60,
        ),
      };

      const historyCount = occurrenceByRecipeId.get(recipe.id) || 0;
      const isUsedInLast7Days = recentRecipeIds.has(recipe.id);
      const newRecipeBonus = aiOptions.preferNewRecipes
        ? this.scoreNewRecipeBonus(historyCount)
        : 0;
      const repeatPenalty = this.scoreRepeatPenalty(
        isUsedInLast7Days,
        aiOptions.avoidRepeatLast7Days,
      );

      // Calculate calories score
      const remainingCalories = remainingMealCalories;
      const recipeCalories = Number(recipe.calories || 0);
      const caloriesScoreVal = this.calculateCaloriesScore(recipeCalories, remainingCalories);
      // Normalize caloriesScoreVal from [-20, 20] range to [0, 1.0] for the weighted sum
      const caloriesScoreNorm = (caloriesScoreVal + 20) / 40;

      // Calculate dynamic diversity score adjustment
      let diversityScore = 0;

      // 1. Món chưa dùng gần đây / Món vừa xuất hiện
      const isRecent =
        options?.recentSuggestedNames?.includes(recipe.name) ||
        options?.recentSuggestedRecipeIds?.includes(recipe.id) ||
        excludeIds.has(recipe.id);
      if (isRecent) {
        // Giảm điểm cho món vừa xuất hiện
        diversityScore -= 0.3;
      } else {
        // Tăng điểm cho món chưa dùng gần đây
        if (aiOptions.preferNewRecipes) {
          diversityScore += 0.2;
        } else {
          diversityScore += 0.1;
        }
      }

      // 2. Món khác nhóm thực phẩm
      const recipeTags = recipe.tags || [];
      const recipeGroup = recipeTags.includes('canh')
        ? 'canh'
        : recipeTags.includes('rau')
          ? 'rau'
          : 'main';
      const isDifferentGroup = !options?.currentDayTags?.includes(recipeGroup);
      if (isDifferentGroup) {
        // Tăng điểm cho món khác nhóm thực phẩm
        diversityScore += 0.15;
      } else {
        // Giảm nhẹ nếu trùng nhóm thực phẩm đã có trong ngày
        diversityScore -= 0.05;
      }

      // 3. Món trùng bữa (same day)
      if (
        options?.currentDayRecipeIds?.includes(recipe.id) ||
        options?.currentDayRecipeNames?.includes(recipe.name)
      ) {
        // Giảm điểm cực mạnh cho món trùng trong ngày để đẩy xuống cuối
        diversityScore -= 1.0;
      }

      // 4. Trùng trong tuần (nếu noRepeatIn7Days là true thì cấm lặp, nếu false thì phạt nhẹ để hạn chế)
      if (options?.weeklyUsedRecipeIds?.includes(recipe.id)) {
        if (aiOptions.avoidRepeatLast7Days) {
          diversityScore -= 1.0;
        } else {
          diversityScore -= 0.25;
        }
      }

      if (isUsedInLast7Days && !aiOptions.avoidRepeatLast7Days) {
        diversityScore -= 0.15;
      }

      // 5. Trùng với ngày hôm trước (ngày liên tiếp)
      if (options?.previousDayRecipeIds?.includes(recipe.id)) {
        console.log(`DEBUG [getRecommendations]: Penalizing consecutive day recipe "${recipe.name}" (ID: ${recipe.id}) with -0.8`);
        diversityScore -= 0.8;
      }

      // Weighted sum matching new Stage 2 formula
      let total =
        scores.nutritionScore * this.WEIGHTS.nutritionHealth +
        scores.ingredientMatch * this.WEIGHTS.ingredientMatch +
        scores.wasteReduction * this.WEIGHTS.wasteReduction +
        scores.preferenceMatch * this.WEIGHTS.preferenceMatch +
        scores.cookTimeScore * this.WEIGHTS.cookTimeScore +
        caloriesScoreNorm * this.WEIGHTS.caloriesScore;

      // Apply user habit adjustments and diversity score
      const habitAdjust = habitScores.get(recipe.id) || 0;
      const unclampedTotal =
        total +
        habitAdjust +
        diversityScore +
        newRecipeBonus / 100 -
        repeatPenalty / 100;
      total = Math.max(0, Math.min(1.0, unclampedTotal));

      // Generate human-readable reasons
      const reasons = this.generateReasons(
        recipe,
        scores,
        expiringItems,
        targetForMeal,
        habitAdjust,
        caloriesScoreVal,
      );

      // Find which inventory items match and which are missing
      const matchedInventory = [];
      const missingIngredients = [];

      for (const ri of recipe.recipeIngredients) {
        const inv = inventoryMap.get(ri.ingredientId);
        if (inv) {
          const daysLeft = inv.expirationDate
            ? this.getDaysLeft(inv.expirationDate)
            : null;
          matchedInventory.push({
            name: ri.ingredient.name,
            daysLeft,
            urgency: daysLeft !== null ? this.getUrgencyLabel(daysLeft) : null,
          });
        } else {
          missingIngredients.push({
            name: ri.ingredient.name,
            quantity: ri.quantity,
            unit: ri.unit,
            estimatedPrice: null,
          });
        }
      }

      return {
        recipe: {
          id: recipe.id,
          name: recipe.name,
          imageUrl: recipe.imageUrl,
          cookingTime: recipe.cookingTime,
          calories: recipe.calories,
          protein: Number(recipe.protein),
          carbs: Number(recipe.carbs),
          fat: Number(recipe.fat),
          tags: recipe.tags,
        },
        score: {
          total: Math.round(total * 100) / 100,
          unclampedTotal,
          newRecipeBonus,
          repeatPenalty,
          mealPlanHistoryCount: historyCount,
          usedInLast7Days: isUsedInLast7Days,
          ...scores,
          caloriesScore: caloriesScoreNorm,
        },
        reasons,
        matchedInventory,
        missingIngredients,
      };
    });

    // ========== STAGE 3: RANK & DEDUPLICATE ==========
    scored.sort((a, b) => b.score.unclampedTotal - a.score.unclampedTotal);

    return {
      calorieTarget: {
        daily: user.dailyCalorieTarget,
        ...calorieTarget,
        targetForMeal,
      },
      recommendations: scored.slice(0, limit),
    };
  }

  private normalizeAiOptions(options: RecommendationOptions) {
    return {
      preferNewRecipes:
        options.options?.preferNewRecipes === true ||
        options.preferNewRecipes === true ||
        options.prioritizeNew === true,
      avoidRepeatLast7Days:
        options.options?.avoidRepeatLast7Days === true ||
        options.avoidRepeatLast7Days === true ||
        options.noRepeatIn7Days === true,
    };
  }

  private async getMealPlanHistory(userId: string, targetDate?: string) {
    const occurrenceByRecipeId = new Map<string, number>();
    const recentRecipeIds = new Set<string>();
    const endDate = targetDate ? this.parseDateInput(targetDate) : new Date();
    endDate.setHours(0, 0, 0, 0);
    const recentStart = new Date(endDate);
    recentStart.setDate(recentStart.getDate() - 7);
    const recentEnd = new Date(endDate);
    recentEnd.setDate(recentEnd.getDate() - 1);

    const rows = await this.mealPlanItemRepo
      .createQueryBuilder('item')
      .innerJoin('item.mealPlan', 'plan')
      .where('plan."userId" = :userId', { userId })
      .andWhere('item."recipeId" IS NOT NULL')
      .select('item."recipeId"', 'recipeId')
      .addSelect('item.meal_date', 'mealDate')
      .getRawMany<{ recipeId: string; mealDate: string }>();

    for (const row of rows) {
      if (!row.recipeId) continue;
      occurrenceByRecipeId.set(
        row.recipeId,
        (occurrenceByRecipeId.get(row.recipeId) || 0) + 1,
      );

      const mealDate = this.parseDateInput(String(row.mealDate));
      if (mealDate >= recentStart && mealDate <= recentEnd) {
        recentRecipeIds.add(row.recipeId);
      }
    }

    return { occurrenceByRecipeId, recentRecipeIds };
  }

  private scoreNewRecipeBonus(historyCount: number): number {
    if (historyCount === 0) return 20;
    if (historyCount === 1) return 10;
    if (historyCount <= 3) return 5;
    return 0;
  }

  private scoreRepeatPenalty(
    usedInLast7Days: boolean,
    avoidRepeatLast7Days: boolean,
  ): number {
    if (!usedInLast7Days) return 0;
    return avoidRepeatLast7Days ? 40 : 8;
  }

  private parseDateInput(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  /**
   * Anti-waste specific endpoint
   * Returns recipes optimized for using expiring ingredients
   */
  async getAntiWasteSuggestions(userId: string) {
    const inventory = await this.inventoryRepo.find({
      where: { userId },
      relations: ['ingredient'],
    });

    const expiringItems = inventory
      .filter((inv) => {
        if (!inv.expirationDate) return false;
        const daysLeft = this.getDaysLeft(inv.expirationDate);
        return daysLeft <= 7 && daysLeft >= 0;
      })
      .map((inv) => ({
        name: inv.ingredient.name,
        daysLeft: this.getDaysLeft(inv.expirationDate),
        urgency: this.getUrgencyLabel(this.getDaysLeft(inv.expirationDate)),
        quantity: inv.quantity,
        unit: inv.unit,
      }))
      .sort((a, b) => a.daysLeft - b.daysLeft);

    // Get recommendations prioritizing anti-waste
    const result = await this.getRecommendations(userId, 'lunch', 5, true);

    return {
      expiringIngredients: expiringItems,
      suggestions: result.recommendations.map((r) => ({
        recipe: r.recipe,
        wasteScore: r.score.wasteReduction,
        usesExpiring: r.matchedInventory.filter((i) => i.urgency),
        reason: `Sử dụng ${r.matchedInventory.filter((i) => i.urgency).length} nguyên liệu sắp hết hạn`,
      })),
    };
  }

  // ==================== SCORING FUNCTIONS ====================

  /**
   * Dimension 1: Ingredient Match (weight = 0.35)
   * Measures how well a recipe uses what the user already has
   * Score = |recipe_ingredients ∩ user_inventory| / |recipe_ingredients|
   */
  private scoreIngredientMatch(
    recipe: Recipe,
    inventoryMap: Map<string, Inventory>,
  ): number {
    const total = recipe.recipeIngredients.length;
    if (total === 0) return 0;

    const matched = recipe.recipeIngredients.filter((ri) =>
      inventoryMap.has(ri.ingredientId),
    ).length;

    return matched / total;
  }

  /**
   * Dimension 2: Waste Reduction (weight = 0.25)
   * Rewards recipes that use ingredients close to expiration
   *
   * WasteScore = Σ(urgency_weight × is_used) / |expiring_ingredients|
   */
  private scoreWasteReduction(
    recipe: Recipe,
    expiringItems: Inventory[],
  ): number {
    if (expiringItems.length === 0) return 0;

    const recipeIngredientIds = new Set(
      recipe.recipeIngredients.map((ri) => ri.ingredientId),
    );

    let totalUrgency = 0;
    for (const item of expiringItems) {
      if (recipeIngredientIds.has(item.ingredientId)) {
        const daysLeft = this.getDaysLeft(item.expirationDate);
        totalUrgency += this.getUrgencyWeight(daysLeft);
      }
    }

    return totalUrgency / expiringItems.length;
  }

  /**
   * Dimension 3: User Preference Match (weight = 0.20)
   * Matches recipe attributes to user's saved preferences
   */
  private scorePreferenceMatch(
    recipe: Recipe,
    preferences: UserPreference | null,
    favRecipeIds: Set<string>,
  ): number {
    if (!preferences) return 0.5; // Neutral if no preferences set

    let score = 0;
    let checks = 0;

    // Check cuisine tags
    if (preferences.cuisineTags?.length) {
      checks++;
      const match = preferences.cuisineTags.some(
        (tag) => recipe.tags?.includes(tag) || recipe.cuisineRegion === tag,
      );
      if (match) score += 1;
    }

    // Check liked ingredients (bonus)
    if (preferences.likedIngredients?.length && recipe.recipeIngredients) {
      checks++;
      const ingredientNames = recipe.recipeIngredients.map(
        (ri) => ri.ingredient?.name,
      );
      const likedUsed = preferences.likedIngredients.filter((liked) =>
        ingredientNames.includes(liked),
      ).length;
      score +=
        likedUsed > 0
          ? Math.min(likedUsed / preferences.likedIngredients.length, 1)
          : 0;
    }

    // Check disliked ingredients (penalty)
    if (preferences.dislikedIngredients?.length && recipe.recipeIngredients) {
      checks++;
      const ingredientNames = recipe.recipeIngredients.map(
        (ri) => ri.ingredient?.name,
      );
      const hasDisliked = preferences.dislikedIngredients.some((disliked) =>
        ingredientNames.includes(disliked),
      );
      score += hasDisliked ? 0 : 1; // Full score if no disliked ingredients
    }

    // Bonus for previously favorited category
    if (favRecipeIds.size > 0) {
      checks++;
      score += favRecipeIds.has(recipe.id) ? 1 : 0;
    }

    return checks > 0 ? score / checks : 0.5;
  }

  /**
   * Dimension 4: Cooking Time Score (weight = 0.10)
   * Faster recipes (within user's limit) score higher
   * CookTimeScore = 1 − (recipe_time / max_time)
   */
  private scoreCookTime(recipe: Recipe, maxTime: number): number {
    if (recipe.cookingTime > maxTime) return 0;
    return 1 - recipe.cookingTime / maxTime;
  }

  /**
   * Dimension 5: Nutrition Score (weight = 0.10)
   * How well recipe calories match the meal target
   * NutritionScore = max(0, 1 − |recipe_cal − target| / target)
   */
  private scoreNutrition(recipe: Recipe, targetCalories: number): number {
    const deviation =
      Math.abs(recipe.calories - targetCalories) / targetCalories;
    return Math.max(0, 1 - deviation);
  }

  // ==================== ANTI-WASTE HELPERS ====================

  private getDaysLeft(expirationDate: Date): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = new Date(expirationDate);
    exp.setHours(0, 0, 0, 0);
    return Math.floor(
      (exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
  }

  /**
   * Urgency weight based on days until expiration
   * CRITICAL (0-1 days) → 1.0
   * HIGH     (2-3 days) → 0.8
   * MEDIUM   (4-5 days) → 0.5
   * LOW      (6-7 days) → 0.3
   */
  private getUrgencyWeight(daysLeft: number): number {
    if (daysLeft <= 1) return 1.0;
    if (daysLeft <= 3) return 0.8;
    if (daysLeft <= 5) return 0.5;
    if (daysLeft <= 7) return 0.3;
    return 0;
  }

  private getUrgencyLabel(daysLeft: number): string | null {
    if (daysLeft <= 1) return 'critical';
    if (daysLeft <= 3) return 'high';
    if (daysLeft <= 5) return 'medium';
    if (daysLeft <= 7) return 'low';
    return null;
  }

  /**
   * Generate human-readable reasons explaining WHY this recipe was recommended
   * This is for the "Recommendation Explanation" bonus feature
   */
  private generateReasons(
    recipe: Recipe,
    scores: Record<string, number>,
    expiringItems: Inventory[],
    targetCalories: number,
    habitAdjust: number = 0,
    caloriesScoreVal: number = 0,
  ): string[] {
    const reasons: string[] = [];

    // Anti-waste reason
    if (scores.wasteReduction > 0.3) {
      const usedExpiring = expiringItems.filter((item) =>
        recipe.recipeIngredients?.some(
          (ri) => ri.ingredientId === item.ingredientId,
        ),
      );
      if (usedExpiring.length > 0) {
        const names = usedExpiring.map((i) => {
          const d = this.getDaysLeft(i.expirationDate);
          return `${i.ingredient.name} (còn ${d} ngày)`;
        });
        reasons.push(`Sử dụng nguyên liệu sắp hết hạn: ${names.join(', ')}`);
      }
    }

    // Ingredient match reason
    if (scores.ingredientMatch > 0.5) {
      reasons.push(
        `Bạn đã có ${Math.round(scores.ingredientMatch * 100)}% nguyên liệu`,
      );
    }

    // Nutrition reason
    if (scores.nutritionScore > 0.8) {
      reasons.push(
        `Calories phù hợp mục tiêu (${recipe.calories}/${targetCalories} kcal)`,
      );
    }

    // Calorie rating reason
    if (caloriesScoreVal >= 10) {
      reasons.push('Lượng calo phù hợp với bữa ăn');
    }

    // Preference reason
    if (scores.preferenceMatch > 0.6) {
      reasons.push('Phù hợp khẩu vị của bạn');
    }

    // Quick cook reason
    if (recipe.cookingTime <= 20) {
      reasons.push(`Nấu nhanh chỉ ${recipe.cookingTime} phút`);
    }

    // Habit learning reason
    if (habitAdjust > 0.05) {
      reasons.push('Được ưu tiên dựa trên thói quen ăn uống của bạn');
    } else if (habitAdjust < -0.05) {
      reasons.push('Hạn chế xuất hiện do bạn từ chối món này gần đây');
    }

    return reasons;
  }

  private calculateCaloriesScore(recipeCalories: number, remainingCalories: number | null): number {
    if (remainingCalories === null || remainingCalories === undefined) return 0;
    if (remainingCalories <= 0) {
      return recipeCalories <= 150 ? 5 : -20;
    }

    const diff = Math.abs(remainingCalories - recipeCalories);

    if (recipeCalories <= remainingCalories && diff <= 150) return 20;
    if (recipeCalories <= remainingCalories) return 10;
    if (recipeCalories <= remainingCalories * 1.2) return 0;

    return -15;
  }

  /**
   * Dynamically adjusts recommendation scores based on user action logs (habit learning)
   */
  private applyHabitScoring(
    recipes: Recipe[],
    logs: UserActionLog[],
  ): Map<string, number> {
    const scores = new Map<string, number>();
    const rejectCounts = new Map<string, number>();
    const acceptCounts = new Map<string, number>();

    for (const log of logs) {
      if (!log.recipeId) continue;
      if (log.actionType === 'reject') {
        rejectCounts.set(
          log.recipeId,
          (rejectCounts.get(log.recipeId) || 0) + 1,
        );
      } else if (log.actionType === 'accept') {
        acceptCounts.set(
          log.recipeId,
          (acceptCounts.get(log.recipeId) || 0) + 1,
        );
      }
    }

    for (const recipe of recipes) {
      let habitAdjustment = 0;

      const rejects = rejectCounts.get(recipe.id) || 0;
      if (rejects > 0) {
        habitAdjustment -= Math.min(rejects * 0.15, 0.45); // Deduct up to -0.45
      }

      const accepts = acceptCounts.get(recipe.id) || 0;
      if (accepts > 0) {
        habitAdjustment += Math.min(accepts * 0.1, 0.3); // Bonus up to +0.3
      }

      scores.set(recipe.id, habitAdjustment);
    }

    return scores;
  }
}
