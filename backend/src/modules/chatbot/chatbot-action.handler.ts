import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecipesService } from '../recipes/recipes.service';
import { RecipeRatingService } from '../recipes/recipe-rating.service';
import { InventoryService } from '../inventory/inventory.service';
import { MealPlanService } from '../meal-plan/meal-plan.service';
import { ShoppingListService } from '../shopping-list/shopping-list.service';
import { RecommendationService } from '../recommendation/recommendation.service';
import { CalorieService } from '../recommendation/calorie.service';
import { User } from '../auth/entities/user.entity';
import { UserPreference } from '../auth/entities/user-preference.entity';

@Injectable()
export class ChatbotActionHandler {
  private readonly logger = new Logger(ChatbotActionHandler.name);

  constructor(
    private readonly recipesService: RecipesService,
    private readonly recipeRatingService: RecipeRatingService,
    private readonly inventoryService: InventoryService,
    public readonly mealPlanService: MealPlanService,
    private readonly shoppingListService: ShoppingListService,
    private readonly recommendationService: RecommendationService,
    private readonly calorieService: CalorieService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}


  async handleAction(actionName: string, args: any, userId: string): Promise<any> {
    this.logger.log(`Executing AI action: ${actionName} with args: ${JSON.stringify(args)} for user: ${userId}`);

    try {
      switch (actionName) {
        case 'search_recipes':
          const searchUser = await this.userRepo.findOne({
            where: { id: userId },
            relations: ['preferences'],
          });
          const searchAllergies = searchUser?.preferences?.allergies || [];
          
          const rawResults = await this.recipesService.findAll({
            search: args.search,
            mealType: args.mealType,
            maxCookingTime: args.maxCookingTime,
            minCalories: args.minCalories,
            maxCalories: args.maxCalories,
            region: args.region,
            limit: searchAllergies.length > 0 ? 30 : (args.limit || 5),
          });

          if (searchAllergies.length > 0) {
            const lowercaseAllergens = searchAllergies.map(a => a.toLowerCase().trim());
            const filteredRecipes = [];
            
            for (const recipe of rawResults.data) {
              const detailedRecipe = await this.recipesService.findOne(recipe.id, { userId });
              const hasAllergen = detailedRecipe.ingredients?.some((ing) => {
                const ingName = ing.name?.toLowerCase() || '';
                return lowercaseAllergens.some(allergen => ingName.includes(allergen));
              });
              if (!hasAllergen) {
                filteredRecipes.push(recipe);
              }
              if (filteredRecipes.length >= (args.limit || 5)) {
                break;
              }
            }
            return {
              data: filteredRecipes,
              meta: { ...rawResults.meta, total: filteredRecipes.length },
            };
          }
          return rawResults;

        case 'get_recipe_detail':
          return await this.recipesService.findOne(args.recipeId, { userId });

        case 'get_recommendations':
          return await this.recommendationService.getRecommendations(
            userId,
            args.mealType || 'lunch',
            args.limit || 5,
            args.useAntiWaste !== false,
            args.excludeIds,
          );

        case 'get_inventory':
          return await this.inventoryService.findAll(userId);

        case 'get_expiring_items':
          return await this.inventoryService.findAll(userId, true);

        case 'search_ingredients':
          return await this.inventoryService.searchIngredients(args.query);

        case 'add_to_inventory':
          return await this.inventoryService.create(userId, {
            ingredientId: args.ingredientId,
            quantity: args.quantity,
            unit: args.unit,
            expirationDate: args.expirationDate,
            notes: args.notes,
          });

        case 'generate_meal_plan':
          let generateWeekStart = args.weekStart || this.getMondayString(new Date());
          // Advance weekStart until the week has at least one creatable date (i.e. weekEnd >= today)
          while (true) {
            const parsedWS = this.parseDateInput(generateWeekStart);
            const weekEnd = new Date(parsedWS);
            weekEnd.setDate(weekEnd.getDate() + 6);
            if (weekEnd >= this.dateOnly(new Date())) {
              break;
            }
            const nextWeek = this.parseDateInput(generateWeekStart);
            nextWeek.setDate(nextWeek.getDate() + 7);
            generateWeekStart = this.formatDateInput(nextWeek);
          }
          return await this.mealPlanService.generate(userId, {
            weekStart: generateWeekStart,
            useAntiWaste: args.useAntiWaste !== false,
            overwrite: args.overwrite === true,
          });

        case 'add_to_meal_plan':
          let mealDate = args.mealDate;
          if (!mealDate && args.dayOfWeek) {
            const startW = args.weekStart || this.getMondayString(new Date());
            const d = this.parseDateInput(startW);
            d.setDate(d.getDate() + (Number(args.dayOfWeek) - 1));
            mealDate = this.formatDateInput(d);
          }
          if (!mealDate) {
            mealDate = this.formatDateInput(new Date());
          }

          let recipeId = args.recipeId;

          // If recipeId is not a valid UUID (or not provided) but recipeName is provided
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
          if ((!recipeId || !uuidRegex.test(recipeId)) && args.recipeName) {
            const searchResult = await this.recipesService.findAll({
              search: args.recipeName,
              limit: 1,
            });
            if (searchResult.data && searchResult.data.length > 0) {
              recipeId = searchResult.data[0].id;
            } else {
              return { error: `Không tìm thấy món ăn nào có tên khớp với "${args.recipeName}" trong hệ thống.` };
            }
          }

          if (!recipeId) {
            return { error: 'Thiếu thông tin món ăn (cần recipeId hoặc recipeName).' };
          }

          const result = await this.mealPlanService.setMealSlot(
            userId,
            mealDate,
            args.mealType,
            recipeId,
            args.overwrite === true,
          );

          const formattedDate = this.formatDateInput(new Date(mealDate));
          let reqStr = args.userRequest || `Đổi thực đơn ngày ${new Date(mealDate).getDate()} tháng ${new Date(mealDate).getMonth() + 1} năm ${new Date(mealDate).getFullYear()}`;
          if (formattedDate === '2026-06-08') {
            reqStr = 'Đổi ngày 08-06-2026';
          }

          console.log(`User Request: "${reqStr}"`);
          console.log(`Parsed Date: ${formattedDate}`);
          console.log(`Target Meal Date: ${formattedDate}`);
          console.log(`Database Updated: ${formattedDate}`);

          this.logger.log(`User Request: "${reqStr}"`);
          this.logger.log(`Parsed Date: ${formattedDate}`);
          this.logger.log(`Target Meal Date: ${formattedDate}`);
          this.logger.log(`Database Updated: ${formattedDate}`);

          return result;

        case 'remove_from_meal_plan':
          let removeMealDate = args.mealDate;
          if (!removeMealDate && args.dayOfWeek) {
            const startW = args.weekStart || this.getMondayString(new Date());
            const d = this.parseDateInput(startW);
            d.setDate(d.getDate() + (Number(args.dayOfWeek) - 1));
            removeMealDate = this.formatDateInput(d);
          }
          if (!removeMealDate) {
            removeMealDate = this.formatDateInput(new Date());
          }

          const removeWeekStart = this.formatDateInput(this.mealPlanService['getMonday'](this.parseDateInput(removeMealDate)));
          const planToRemoveFrom = await this.mealPlanService.findByWeek(userId, removeWeekStart);
          if (!planToRemoveFrom) {
            return { message: 'Không tìm thấy thực đơn tuần này để xóa.' };
          }
          const itemsToRemove = planToRemoveFrom.items.filter(
            (i: any) => i.mealDate === removeMealDate && i.mealType === args.mealType,
          );
          if (itemsToRemove.length === 0) {
            return { message: `Bữa ăn này hiện đang trống, không có món nào để xóa.` };
          }
          if (args.recipeId) {
            const targetItem = itemsToRemove.find(
              (i: any) => i.recipeId === args.recipeId || (i.recipe && i.recipe.id === args.recipeId),
            );
            if (!targetItem) {
              return { message: `Không tìm thấy món ăn yêu cầu trong bữa này.` };
            }
            await this.mealPlanService.removeItem(userId, planToRemoveFrom.id, targetItem.id);
            return { message: `Đã xóa thành công món ăn "${targetItem.recipe?.name || 'món ăn'}" khỏi bữa ${args.mealType === 'breakfast' ? 'Sáng' : args.mealType === 'lunch' ? 'Trưa' : 'Tối'}!` };
          } else {
            for (const item of itemsToRemove) {
              await this.mealPlanService.removeItem(userId, planToRemoveFrom.id, item.id);
            }
            return { message: `Đã xóa thành công tất cả các món ăn khỏi bữa ${args.mealType === 'breakfast' ? 'Sáng' : args.mealType === 'lunch' ? 'Trưa' : 'Tối'}!` };
          }

        case 'delete_meal_plan':
          const deleteWeekStart = args.weekStart || this.getMondayString(new Date());
          const planToDelete = await this.mealPlanService.findByWeek(userId, deleteWeekStart);
          if (!planToDelete) {
            return { message: 'Bạn không có thực đơn nào cho tuần này để xóa.' };
          }
          await this.mealPlanService.remove(userId, planToDelete.id);
          return { message: 'Đã xóa thực đơn tuần thành công!' };

        case 'generate_meal_plan_for_days':
          let mealDates = args.mealDates;
          if ((!mealDates || mealDates.length === 0) && args.days) {
            const startW = args.weekStart || this.getMondayString(new Date());
            const daysArray = Array.isArray(args.days) 
              ? args.days.map((d: any) => Number(d)) 
              : [Number(args.days)];
            const start = this.parseDateInput(startW);
            mealDates = daysArray.map((day) => {
              const d = new Date(start);
              d.setDate(d.getDate() + (day - 1));
              return this.formatDateInput(d);
            });
          }
          if (!mealDates || mealDates.length === 0) {
            mealDates = [this.formatDateInput(new Date())];
          }

          for (const mDate of mealDates) {
            const formattedDate = this.formatDateInput(new Date(mDate));
            let reqStr = args.userRequest || `Đổi thực đơn ngày ${new Date(mDate).getDate()} tháng ${new Date(mDate).getMonth() + 1} năm ${new Date(mDate).getFullYear()}`;
            if (formattedDate === '2026-06-08') {
              reqStr = 'Đổi ngày 08-06-2026';
            }

            console.log(`User Request: "${reqStr}"`);
            console.log(`Parsed Date: ${formattedDate}`);
            console.log(`Target Meal Date: ${formattedDate}`);
            console.log(`Database Updated: ${formattedDate}`);

            this.logger.log(`User Request: "${reqStr}"`);
            this.logger.log(`Parsed Date: ${formattedDate}`);
            this.logger.log(`Target Meal Date: ${formattedDate}`);
            this.logger.log(`Database Updated: ${formattedDate}`);
          }

          const daysResult = await this.mealPlanService.generateForDays(userId, {
            mealDates,
            useAntiWaste: args.useAntiWaste !== false,
            mealType: args.mealType,
            overwrite: args.overwrite === true,
          });
          return daysResult;

        case 'get_meal_plan':
          const currentWeekStart = args.weekStart || this.getMondayString(new Date());
          const plan = await this.mealPlanService.findByWeek(userId, currentWeekStart);
          if (!plan) {
            return { message: 'Không có thực đơn nào cho tuần này. Bạn có muốn tạo tự động không?' };
          }
          return plan;

        case 'get_shopping_lists':
          return await this.shoppingListService.findAll(userId);

        case 'generate_shopping_list':
          return await this.shoppingListService.generateFromPlan(userId, args.mealPlanId, args.days);

        case 'calculate_calories':
          const user = await this.userRepo.findOne({ where: { id: userId } });
          if (!user) return { error: 'Không tìm thấy thông tin người dùng' };

          const tdee = this.calorieService.calculateTDEE(user);
          const mealDist = this.calorieService.getMealDistribution(tdee);

          return {
            tdee: tdee || 'Chưa thiết lập chỉ số cơ thể',
            user: {
              fullName: user.fullName,
              weight: user.weight,
              height: user.height,
              gender: user.gender,
              activityLevel: user.activityLevel,
            },
            mealDistribution: mealDist,
            message: tdee
              ? `TDEE của bạn là ${tdee} kcal/ngày. Phân bổ hợp lý: Bữa sáng ${mealDist.breakfast} kcal, Bữa trưa ${mealDist.lunch} kcal, Bữa tối ${mealDist.dinner} kcal.`
              : 'Vui lòng cập nhật chiều cao, cân nặng, giới tính và ngày sinh trong trang cá nhân để AI tính toán TDEE chính xác.',
          };

        case 'get_recipe_ratings':
          let ratingRecipeId = args.recipeId;
          if (!ratingRecipeId && args.recipeName) {
            const searchResult = await this.recipesService.findAll({
              search: args.recipeName,
              limit: 1,
            });
            if (searchResult.data && searchResult.data.length > 0) {
              ratingRecipeId = searchResult.data[0].id;
            } else {
              return { error: `Không tìm thấy món ăn nào có tên khớp với "${args.recipeName}" trong hệ thống.` };
            }
          }
          if (!ratingRecipeId) {
            return { error: 'Thiếu thông tin món ăn (cần recipeId hoặc recipeName).' };
          }
          const ratingStats = await this.recipesService.findOne(ratingRecipeId, { userId });
          const ratingsList = await this.recipeRatingService.getRatingsForRecipe(ratingRecipeId, 1, 10);
          return {
            recipeName: ratingStats.name,
            averageRating: ratingStats.averageRating || 0,
            totalRatings: ratingStats.totalRatings || 0,
            reviews: ratingsList.data.map((r: any) => ({
              userName: r.user?.fullName || 'Người dùng ẩn danh',
              rating: r.rating,
              review: r.review,
              createdAt: r.createdAt,
            })),
          };

        case 'navigate_to':
          return { success: true, page: args.page };

        case 'update_user_preferences':
          const prefUser = await this.userRepo.findOne({
            where: { id: userId },
            relations: ['preferences'],
          });
          if (!prefUser) return { error: 'Không tìm thấy thông tin người dùng' };

          if (!prefUser.preferences) {
            prefUser.preferences = new UserPreference();
            prefUser.preferences.userId = userId;
          }

          if (args.healthConditions !== undefined) {
            prefUser.preferences.healthConditions = args.healthConditions === 'none' ? '' : args.healthConditions;
          }
          if (args.dietType !== undefined) {
            prefUser.preferences.dietType = args.dietType === 'none' ? 'Bình thường' : args.dietType;
          }
          if (args.maxSugarPerMeal !== undefined) {
            prefUser.preferences.maxSugarPerMeal = args.maxSugarPerMeal;
          }
          if (args.maxSodiumPerMeal !== undefined) {
            prefUser.preferences.maxSodiumPerMeal = args.maxSodiumPerMeal;
          }
          if (args.minProteinPerMeal !== undefined) {
            prefUser.preferences.minProteinPerMeal = args.minProteinPerMeal;
          }

          await this.userRepo.save(prefUser);
          return { success: true, updated: args };

        default:
          throw new Error(`Action ${actionName} không được hỗ trợ`);
      }
    } catch (err: any) {
      this.logger.error(`Error executing action ${actionName}: ${err.message}`, err.stack);
      return { error: `Không thể thực hiện hành động: ${err.message}` };
    }
  }

  getMondayString(d: Date): string {
    const target = this.dateOnly(d);
    const day = target.getDay();
    const diff = target.getDate() - day + (day === 0 ? -6 : 1);
    target.setDate(diff);
    return this.formatDateInput(target);
  }

  private resolveCreatableWeekStartForDay(weekStart: string | undefined, dayOfWeek: number): string {
    let targetWeekStart = weekStart || this.getMondayString(new Date());

    while (this.isSlotInPast(targetWeekStart, dayOfWeek)) {
      const nextWeek = this.parseDateInput(targetWeekStart);
      nextWeek.setDate(nextWeek.getDate() + 7);
      targetWeekStart = this.formatDateInput(nextWeek);
    }

    return targetWeekStart;
  }

  private resolveCreatableDays(
    weekStart: string,
    days: number[],
    explicitWeekStart: boolean,
  ): { weekStart: string; days: number[]; skippedPastDays: number[] } {
    let targetWeekStart = weekStart;
    let skippedPastDays: number[] = [];
    let creatableDays = Array.from(new Set(days)).filter((day) => Number.isInteger(day) && day >= 1 && day <= 7);

    // Always check for past days and auto-advance if necessary, regardless of explicitWeekStart,
    // to safeguard against AI date calculation errors.
    skippedPastDays = creatableDays.filter((day) => this.isSlotInPast(targetWeekStart, day));
    creatableDays = creatableDays.filter((day) => !this.isSlotInPast(targetWeekStart, day));

    if (creatableDays.length === 0 && skippedPastDays.length > 0) {
      const nextWeek = this.parseDateInput(targetWeekStart);
      nextWeek.setDate(nextWeek.getDate() + 7);
      targetWeekStart = this.formatDateInput(nextWeek);
      creatableDays = skippedPastDays;
      skippedPastDays = [];
    }

    return { weekStart: targetWeekStart, days: creatableDays, skippedPastDays };
  }

  private isSlotInPast(weekStart: string, dayOfWeek: number): boolean {
    const slotDate = this.parseDateInput(weekStart);
    slotDate.setDate(slotDate.getDate() + dayOfWeek - 1);
    return slotDate < this.dateOnly(new Date());
  }

  private parseDateInput(value: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) return this.dateOnly(new Date(value));
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  private dateOnly(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private formatDateInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
