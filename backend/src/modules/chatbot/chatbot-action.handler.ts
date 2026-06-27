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
import { NutritionAnalyzerService } from '../recommendation/nutrition-analyzer.service';
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
    private readonly nutritionAnalyzerService: NutritionAnalyzerService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  async handleAction(
    actionName: string,
    args: any,
    userId: string,
  ): Promise<any> {
    this.logger.log(
      `Executing AI action: ${actionName} with args: ${JSON.stringify(args)} for user: ${userId}`,
    );

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
            minProtein: args.minProtein,
            difficulty: args.difficulty,
            excludedIngredients: args.excludedIngredients,
            region: args.region,
            limit: searchAllergies.length > 0 ? 30 : args.limit || 5,
          });

          if (searchAllergies.length > 0) {
            const lowercaseAllergens = searchAllergies.map((a) =>
              a.toLowerCase().trim(),
            );
            const filteredRecipes = [];

            for (const recipe of rawResults.data) {
              const detailedRecipe = await this.recipesService.findOne(
                recipe.id,
                { userId },
              );
              const hasAllergen = detailedRecipe.ingredients?.some((ing) => {
                const ingName = ing.name?.toLowerCase() || '';
                return lowercaseAllergens.some((allergen) =>
                  ingName.includes(allergen),
                );
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

        case 'search_recipes_by_ingredients':
          return await this.recipesService.findByIngredients(
            args.ingredients || [],
            {
              limit: args.limit || 5,
              mealType: args.mealType,
              maxCookingTime: args.maxCookingTime,
              maxCalories: args.maxCalories,
              minProtein: args.minProtein,
              excludedIngredients: args.excludedIngredients,
            },
          );

        case 'get_recipe_detail':
          return await this.recipesService.findOne(args.recipeId, { userId });

        case 'get_recommendations':
          return await this.recommendationService.getRecommendations(
            userId,
            args.mealType || 'lunch',
            args.limit || 5,
            args.useAntiWaste !== false,
            {
              excludeIds: args.excludeIds,
              excludeNames: args.excludeNames,
              currentDayRecipeIds: args.currentDayRecipeIds,
              options: {
                preferNewRecipes:
                  args.options?.preferNewRecipes !== undefined
                    ? args.options.preferNewRecipes
                    : true,
                avoidRepeatLast7Days:
                  args.options?.avoidRepeatLast7Days !== undefined
                    ? args.options.avoidRepeatLast7Days
                    : true,
              },
            },
          );

        case 'get_favorites':
          return await this.recipesService.getFavorites(userId, {
            page: 1,
            limit: args.limit || 10,
            search: args.search,
          });

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
          let generateWeekStart =
            args.weekStart || this.getMondayString(new Date());
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
          if (args.mealType && this.isMealSlotInPastForDate(mealDate, args.mealType)) {
            return {
              message: `Bữa ${this.formatMealTypeLabel(args.mealType)} ${this.formatChatDateLabel(mealDate)} đã qua nên không thể thêm món.`,
            };
          }

          let recipeId = args.recipeId;

          // If recipeId is not a valid UUID (or not provided) but recipeName is provided
          const uuidRegex =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
          if ((!recipeId || !uuidRegex.test(recipeId)) && args.recipeName) {
            const searchResult = await this.recipesService.findAll({
              search: args.recipeName,
              limit: 1,
            });
            if (searchResult.data && searchResult.data.length > 0) {
              recipeId = searchResult.data[0].id;
            } else {
              return {
                error: `Không tìm thấy món ăn nào có tên khớp với "${args.recipeName}" trong hệ thống.`,
              };
            }
          }

          if (!recipeId) {
            return {
              error: 'Thiếu thông tin món ăn (cần recipeId hoặc recipeName).',
            };
          }

          const result = await this.mealPlanService.setMealSlot(
            userId,
            mealDate,
            args.mealType,
            recipeId,
            args.overwrite === true,
          );

          const formattedDate = this.formatDateInput(new Date(mealDate));
          let reqStr =
            args.userRequest ||
            `Đổi thực đơn ngày ${new Date(mealDate).getDate()} tháng ${new Date(mealDate).getMonth() + 1} năm ${new Date(mealDate).getFullYear()}`;
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

        case 'replace_meal_item': {
          const targetDate = args.mealDate || this.formatDateInput(new Date());
          const targetWeekStart = this.getMondayString(
            this.parseDateInput(targetDate),
          );
          const targetPlan = await this.mealPlanService.findByWeek(
            userId,
            targetWeekStart,
          );
          if (!targetPlan) return { error: 'Không tìm thấy thực đơn cần đổi món.' };

          const sameDate = (value: any) =>
            this.formatDateInput(this.parseDateInput(String(value))) === targetDate;
          const slotItems = targetPlan.items.filter(
            (item: any) =>
              sameDate(item.mealDate) &&
              (!args.mealType || item.mealType === args.mealType),
          );
          if (args.mealType && this.isMealSlotInPastForDate(targetDate, args.mealType)) {
            const names = this.formatRecipeNames(slotItems);
            return {
              message: names
                ? `Bữa ${this.formatMealTypeLabel(args.mealType)} ${this.formatChatDateLabel(targetDate)} đã qua nên không thể đổi món. Các món hiện có: ${names}.`
                : `Bữa ${this.formatMealTypeLabel(args.mealType)} ${this.formatChatDateLabel(targetDate)} đã qua và hiện không có món nào.`,
            };
          }
          const targetItem = args.itemId
            ? slotItems.find((item: any) => item.id === args.itemId)
            : args.oldRecipeName
              ? slotItems.find((item: any) =>
                  item.recipe?.name
                    ?.toLowerCase()
                    .includes(String(args.oldRecipeName).toLowerCase()),
                )
              : slotItems[0];
          if (!targetItem) {
            return { error: 'Không tìm thấy món phù hợp trong bữa ăn để đổi.' };
          }
          if (!args.mealType && this.isMealSlotInPastForDate(targetDate, targetItem.mealType)) {
            return {
              message: `Bữa ${this.formatMealTypeLabel(targetItem.mealType)} ${this.formatChatDateLabel(targetDate)} đã qua nên không thể đổi món. Các món hiện có: ${this.formatRecipeNames(slotItems) || targetItem.recipe?.name || 'món đã chọn'}.`,
            };
          }

          let replacementId = args.recipeId;
          let replacementName = args.recipeName;
          if (!replacementId && replacementName) {
            const found = await this.recipesService.findAll({
              search: replacementName,
              limit: 1,
              excludedIngredients: args.excludedIngredients,
            });
            replacementId = found.data?.[0]?.id;
            replacementName = found.data?.[0]?.name;
          }
          if (!replacementId) {
            const excludedIds = targetPlan.items
              .filter((item: any) => sameDate(item.mealDate))
              .map((item: any) => item.recipeId);
            const recommendations = await this.recommendationService.getRecommendations(
              userId,
              args.mealType || targetItem.mealType,
              5,
              args.useAntiWaste !== false,
              {
                excludeIds: excludedIds,
                options: {
                  preferNewRecipes:
                    args.options?.preferNewRecipes !== undefined
                      ? args.options.preferNewRecipes
                      : true,
                  avoidRepeatLast7Days:
                    args.options?.avoidRepeatLast7Days !== undefined
                      ? args.options.avoidRepeatLast7Days
                      : true,
                },
              },
            );
            const recommendationPayload: any = recommendations;
            const candidates =
              recommendationPayload?.recommendations ||
              recommendationPayload?.data?.recommendations ||
              recommendationPayload?.data ||
              [];
            const recipe = candidates.map((item: any) => item.recipe || item)[0];
            replacementId = recipe?.id;
            replacementName = recipe?.name;
          }
          if (!replacementId) return { error: 'Chưa tìm được món thay thế phù hợp.' };

          await this.mealPlanService.swapRecipe(
            userId,
            targetPlan.id,
            targetItem.id,
            replacementId,
          );
          const updatedPlan = await this.mealPlanService.findByWeek(
            userId,
            targetWeekStart,
          );
          return {
            ...updatedPlan,
            replacedItemId: targetItem.id,
            oldRecipeName: targetItem.recipe?.name,
            newRecipeName: replacementName,
            message: `Đã đổi món thành ${replacementName || 'món mới'}.`,
          };
        }

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

          const removeWeekStart = this.formatDateInput(
            this.mealPlanService['getMonday'](
              this.parseDateInput(removeMealDate),
            ),
          );
          const planToRemoveFrom = await this.mealPlanService.findByWeek(
            userId,
            removeWeekStart,
          );
          if (!planToRemoveFrom) {
            return { message: 'Không tìm thấy thực đơn tuần này để xóa.' };
          }
          const itemsToRemove = planToRemoveFrom.items.filter(
            (i: any) =>
              this.formatDateInput(this.parseDateInput(String(i.mealDate))) ===
                removeMealDate &&
              (!args.mealType || i.mealType === args.mealType),
          );
          if (args.mealType && this.isMealSlotInPastForDate(removeMealDate, args.mealType)) {
            const mealLabel = this.formatMealTypeLabel(args.mealType);
            const dateLabel = this.formatChatDateLabel(removeMealDate);
            const names = this.formatRecipeNames(itemsToRemove);
            return {
              message: names
                ? `Bữa ${mealLabel} ${dateLabel} đã qua nên không thể xóa món. Các món hiện có: ${names}.`
                : `Bữa ${mealLabel} ${dateLabel} đã qua và hiện không có món nào.`,
            };
          }
          if (itemsToRemove.length === 0) {
            const mealLabel = this.formatMealTypeLabel(args.mealType);
            const dateLabel = this.formatChatDateLabel(removeMealDate);
            return {
              message: `Bữa ${mealLabel} ${dateLabel} hiện chưa có món nào để xóa.`,
            };
          }
          if (args.recipeId || args.recipeName) {
            const targetItem = itemsToRemove.find(
              (i: any) =>
                i.recipeId === args.recipeId ||
                (i.recipe && i.recipe.id === args.recipeId) ||
                (args.recipeName &&
                  i.recipe?.name
                    ?.toLowerCase()
                    .includes(String(args.recipeName).toLowerCase())),
            );
            if (!targetItem) {
              const mealLabel = this.formatMealTypeLabel(args.mealType);
              const dateLabel = this.formatChatDateLabel(removeMealDate);
              return {
                message: `Không tìm thấy món cần xóa trong bữa ${mealLabel} ${dateLabel}.`,
              };
            }
            await this.mealPlanService.removeItem(
              userId,
              planToRemoveFrom.id,
              targetItem.id,
            );
            const updatedPlan = await this.mealPlanService.findByWeek(
              userId,
              removeWeekStart,
            );
            return {
              ...updatedPlan,
              removedCount: 1,
              removedRecipeName: targetItem.recipe?.name,
              message: `Đã xóa món ${targetItem.recipe?.name || 'đã chọn'} khỏi bữa ${this.formatMealTypeLabel(args.mealType)} ${this.formatChatDateLabel(removeMealDate)}.`,
            };
          } else {
            const requestedRemoveCount = Number(args.removeCount);
            const targetsToRemove =
              Number.isFinite(requestedRemoveCount) && requestedRemoveCount > 0
                ? itemsToRemove.slice(0, requestedRemoveCount)
                : itemsToRemove;

            for (const item of targetsToRemove) {
              await this.mealPlanService.removeItem(
                userId,
                planToRemoveFrom.id,
                item.id,
              );
            }
            const updatedPlan = await this.mealPlanService.findByWeek(
              userId,
              removeWeekStart,
            );
            const mealLabel = this.formatMealTypeLabel(args.mealType);
            const dateLabel = this.formatChatDateLabel(removeMealDate);
            const removedNames = targetsToRemove
              .map((item: any) => item.recipe?.name)
              .filter(Boolean)
              .join(', ');
            return {
              ...updatedPlan,
              removedCount: targetsToRemove.length,
              removedRecipeNames: targetsToRemove
                .map((item: any) => item.recipe?.name)
                .filter(Boolean),
              message:
                targetsToRemove.length === 1
                  ? `Đã xóa món ${targetsToRemove[0].recipe?.name || 'đã chọn'} khỏi bữa ${mealLabel} ${dateLabel}.`
                  : `Đã xóa ${targetsToRemove.length} món khỏi bữa ${mealLabel} ${dateLabel}${removedNames ? `: ${removedNames}` : ''}.`,
            };
          }

        case 'delete_meal_plan':
          const deleteWeekStart =
            args.weekStart || this.getMondayString(new Date());
          const planToDelete = await this.mealPlanService.findByWeek(
            userId,
            deleteWeekStart,
          );
          if (!planToDelete) {
            return {
              message: 'Bạn không có thực đơn nào cho tuần này để xóa.',
            };
          }
          await this.mealPlanService.remove(userId, planToDelete.id);
          return { message: 'Đã xóa thực đơn tuần thành công!' };

        case 'remove_meal_day': {
          const targetDate = args.mealDate || this.formatDateInput(new Date());
          const formattedTargetDate = this.formatCalendarDate(targetDate);
          if (this.isPastDateValue(targetDate)) {
            return {
              removedCount: 0,
              message: `Ngày ${formattedTargetDate} đã qua nên không thể xóa thực đơn. Bạn chỉ có thể xem lại thực đơn ngày đó.`,
            };
          }

          const weekStart = this.getMondayString(this.parseDateInput(targetDate));
          const targetPlan = await this.mealPlanService.findByWeek(userId, weekStart);
          if (!targetPlan) {
            return {
              removedCount: 0,
              message: `Ngày ${formattedTargetDate} hiện chưa có món nào để xóa.`,
            };
          }
          const targets = targetPlan.items.filter((item: any) => {
            const itemDate = this.formatDateInput(
              this.parseDateInput(String(item.mealDate)),
            );
            return (
              itemDate === targetDate &&
              (!args.mealType || item.mealType === args.mealType) &&
              !this.isMealSlotInPastForDate(targetDate, item.mealType)
            );
          });
          if (targets.length === 0) {
            return {
              removedCount: 0,
              message: `Ngày ${formattedTargetDate} hiện chưa có món nào để xóa.`,
            };
          }
          for (const item of targets) {
            await this.mealPlanService.removeItem(userId, targetPlan.id, item.id);
          }
          const updatedPlan = await this.mealPlanService.findByWeek(userId, weekStart);
          return {
            ...updatedPlan,
            id: targetPlan.id,
            weekStart,
            removedCount: targets.length,
            message: `Tôi đã xóa tất cả món trong thực đơn ngày ${formattedTargetDate} của bạn.`,
          };
        }

        case 'generate_meal_plan_for_days':
          let mealDates = args.targetDate ? [args.targetDate] : args.mealDates;
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

          if (mealDates.some((date: string) => this.isPastDateValue(date))) {
            return {
              success: false,
              reason: 'PAST_DATE_READONLY',
              message: 'Ngày này đã qua nên không thể tạo lại thực đơn.',
            };
          }

          const requestedMealTypes = Array.isArray(args.mealTypes)
            ? args.mealTypes
            : args.mealType
              ? [args.mealType]
              : ['breakfast', 'lunch', 'dinner'];
          const editableMealTypes = requestedMealTypes.filter((mealType: string) =>
            mealDates.some(
              (date: string) =>
                !this.isMealSlotInPastForDate(date, mealType),
            ),
          );
          if (editableMealTypes.length === 0) {
            return {
              success: false,
              reason: 'PAST_DATE_READONLY',
              message:
                'Các bữa trong ngày này đã qua nên không thể tạo lại thực đơn.',
            };
          }

          for (const mDate of mealDates) {
            const formattedDate = this.formatDateInput(new Date(mDate));
            let reqStr =
              args.userRequest ||
              `Đổi thực đơn ngày ${new Date(mDate).getDate()} tháng ${new Date(mDate).getMonth() + 1} năm ${new Date(mDate).getFullYear()}`;
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

          const daysResult = await this.mealPlanService.generateForDays(
            userId,
            {
              mealDates,
              targetDate: args.targetDate,
              scope: args.scope,
              source: args.source,
              useAntiWaste: args.useAntiWaste !== false,
              mealType: args.mealType,
              mealTypes: editableMealTypes,
              overwrite: args.overwrite === true,
              options: {
                preferNewRecipes:
                  args.options?.preferNewRecipes !== undefined
                    ? args.options.preferNewRecipes
                    : true,
                avoidRepeatLast7Days:
                  args.options?.avoidRepeatLast7Days !== undefined
                    ? args.options.avoidRepeatLast7Days
                    : true,
              },
            },
          );
          const targetDate = args.targetDate || mealDates[0];
          return {
            ...daysResult,
            targetDate,
            message: `Tôi đã tạo thực đơn cho ngày ${this.formatCalendarDate(targetDate)}.`,
          };

        case 'get_meal_plan':
          const currentWeekStart =
            args.weekStart || this.getMondayString(new Date());
          const plan = await this.mealPlanService.findByWeek(
            userId,
            currentWeekStart,
          );
          if (!plan) {
            return {
              message:
                'Không có thực đơn nào cho tuần này. Bạn có muốn tạo tự động không?',
            };
          }
          return plan;

        case 'get_shopping_lists':
          return await this.shoppingListService.findAll(userId);

        case 'generate_shopping_list':
          return await this.shoppingListService.generateFromPlan(
            userId,
            args.mealPlanId,
            args.days,
          );

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

        case 'analyze_meal_plan': {
          const targetDate = args.mealDate || this.formatDateInput(new Date());
          const weekStart =
            args.weekStart ||
            this.getMondayString(this.parseDateInput(targetDate));
          const targetPlan = await this.mealPlanService.findByWeek(
            userId,
            weekStart,
          );
          if (!targetPlan) return { error: 'Chưa có thực đơn để phân tích.' };
          const nutrition = await this.mealPlanService.getNutrition(
            userId,
            targetPlan.id,
          );
          const weeklyAnalysis =
            await this.nutritionAnalyzerService.analyzeWeeklyPlan(
              userId,
              weekStart,
            );
          const selectedDay =
            args.period === 'week'
              ? undefined
              : nutrition.daily.find((day: any) => {
                  const date = this.parseDateInput(weekStart);
                  date.setDate(date.getDate() + Number(day.day) - 1);
                  return this.formatDateInput(date) === targetDate;
                });
          return {
            planId: targetPlan.id,
            weekStart,
            period: args.period || 'day',
            ...(selectedDay || nutrition.weeklyAvg),
            totalDishes: selectedDay?.dishCount ?? nutrition.totalDishes,
            calorieTarget: nutrition.calorieTarget,
            macroDistribution: nutrition.macroDistribution,
            insights: weeklyAnalysis,
          };
        }

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
              return {
                error: `Không tìm thấy món ăn nào có tên khớp với "${args.recipeName}" trong hệ thống.`,
              };
            }
          }
          if (!ratingRecipeId) {
            return {
              error: 'Thiếu thông tin món ăn (cần recipeId hoặc recipeName).',
            };
          }
          const ratingStats = await this.recipesService.findOne(
            ratingRecipeId,
            { userId },
          );
          const ratingsList =
            await this.recipeRatingService.getRatingsForRecipe(
              ratingRecipeId,
              1,
              10,
            );
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
          if (!prefUser)
            return { error: 'Không tìm thấy thông tin người dùng' };

          if (!prefUser.preferences) {
            prefUser.preferences = new UserPreference();
            prefUser.preferences.userId = userId;
          }

          if (args.healthConditions !== undefined) {
            prefUser.preferences.healthConditions =
              args.healthConditions === 'none' ? '' : args.healthConditions;
          }
          if (args.dietType !== undefined) {
            prefUser.preferences.dietType =
              args.dietType === 'none' ? 'Bình thường' : args.dietType;
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
      this.logger.error(
        `Error executing action ${actionName}: ${err.message}`,
        err.stack,
      );
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

  private resolveCreatableWeekStartForDay(
    weekStart: string | undefined,
    dayOfWeek: number,
  ): string {
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
    let creatableDays = Array.from(new Set(days)).filter(
      (day) => Number.isInteger(day) && day >= 1 && day <= 7,
    );

    // Always check for past days and auto-advance if necessary, regardless of explicitWeekStart,
    // to safeguard against AI date calculation errors.
    skippedPastDays = creatableDays.filter((day) =>
      this.isSlotInPast(targetWeekStart, day),
    );
    creatableDays = creatableDays.filter(
      (day) => !this.isSlotInPast(targetWeekStart, day),
    );

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

  private isMealSlotInPastForDate(dateValue: string, mealType: string): boolean {
    const slotDate = this.dateOnly(this.parseDateInput(dateValue));
    const today = this.dateOnly(new Date());
    if (slotDate < today) return true;
    if (slotDate > today) return false;

    const currentHour = new Date().getHours();
    if (mealType === 'breakfast') return currentHour >= 10;
    if (mealType === 'lunch') return currentHour >= 14;
    if (mealType === 'dinner') return currentHour >= 21;
    return false;
  }

  private isPastDateValue(dateValue: string): boolean {
    return this.dateOnly(this.parseDateInput(dateValue)) < this.dateOnly(new Date());
  }

  private formatMealTypeLabel(mealType?: string): string {
    if (mealType === 'breakfast') return 'Sáng';
    if (mealType === 'lunch') return 'Trưa';
    if (mealType === 'dinner') return 'Tối';
    if (mealType === 'snack') return 'Phụ';
    return 'đã chọn';
  }

  private formatRecipeNames(items: any[]): string {
    return items
      .map((item: any) => item.recipe?.name)
      .filter(Boolean)
      .join(', ');
  }

  private formatChatDateLabel(dateValue: string): string {
    const date = this.dateOnly(this.parseDateInput(dateValue));
    const today = this.dateOnly(new Date());
    const yesterday = this.dateOnly(new Date());
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = this.dateOnly(new Date());
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.getTime() === today.getTime()) return 'hôm nay';
    if (date.getTime() === yesterday.getTime()) return 'hôm qua';
    if (date.getTime() === tomorrow.getTime()) return 'ngày mai';

    const labels = [
      'Chủ Nhật',
      'Thứ Hai',
      'Thứ Ba',
      'Thứ Tư',
      'Thứ Năm',
      'Thứ Sáu',
      'Thứ Bảy',
    ];
    return `ngày ${labels[date.getDay()]}`;
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

  private formatCalendarDate(dateValue: string): string {
    const date = this.parseDateInput(dateValue);
    return [
      String(date.getDate()).padStart(2, '0'),
      String(date.getMonth() + 1).padStart(2, '0'),
      date.getFullYear(),
    ].join('/');
  }
}
