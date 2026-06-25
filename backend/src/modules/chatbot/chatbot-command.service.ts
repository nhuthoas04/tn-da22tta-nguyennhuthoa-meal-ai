import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatbotAIService } from './chatbot-ai.service';
import { ChatbotActionHandler } from './chatbot-action.handler';
import { ChatbotIntentService } from './chatbot-intent.service';
import { ChatMessage } from './entities/chat-message.entity';
import { User } from '../auth/entities/user.entity';
import { getMaxRecommendedDishes } from '../meal-plan/meal-portion.util';
import {
  ChatbotCommandResponse,
  ChatbotConversationContext,
  ChatbotEntities,
  ChatbotIntent,
  ChatbotQuickAction,
  EMPTY_CHATBOT_CONTEXT,
} from './chatbot.types';

@Injectable()
export class ChatbotCommandService {
  private readonly logger = new Logger(ChatbotCommandService.name);

  constructor(
    private readonly intentService: ChatbotIntentService,
    private readonly actionHandler: ChatbotActionHandler,
    private readonly aiService: ChatbotAIService,
    @InjectRepository(ChatMessage)
    private readonly chatMessageRepo: Repository<ChatMessage>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async sendMessage(userId: string, message: string): Promise<ChatbotCommandResponse> {
    const context = await this.loadContext(userId);

    if (context.pendingConfirmation) {
      if (this.intentService.isAffirmative(message)) {
        return this.processKnownIntent(
          userId,
          message,
          context.pendingConfirmation.intent,
          { ...context.pendingConfirmation.entities, confirmed: true },
          { ...context, pendingConfirmation: undefined },
        );
      }
      if (this.intentService.isNegative(message)) {
        const nextContext = {
          ...context,
          pendingConfirmation: undefined,
          lastAction: context.pendingConfirmation.intent,
        };
        return this.saveResponse(userId, message, {
          success: true,
          text: 'Đã hủy thao tác. Dữ liệu của bạn không thay đổi.',
          intent: context.pendingConfirmation.intent,
          entities: {},
          nextAction: 'NONE',
        }, nextContext);
      }
    }

    if (context.pendingQuestion) {
      const followUp = this.intentService.extractEntities(message, undefined, context);
      const merged = { ...context.pendingQuestion.entities, ...followUp };
      const missing = context.pendingQuestion.missing;
      const isAnswered =
        (missing === 'date' && !!merged.date) ||
        (missing === 'mealType' && !!merged.mealType) ||
        (missing === 'quantity' && !!merged.quantity) ||
        (missing === 'recipe' && !!(merged.recipeId || merged.recipeName));
      if (isAnswered) {
        return this.processKnownIntent(
          userId,
          message,
          context.pendingQuestion.intent,
          merged,
          { ...context, pendingQuestion: undefined },
        );
      }
    }

    const detection = this.intentService.detect(message, context);
    if (detection.intent === 'UNKNOWN') {
      const aiAvailable = this.aiService.isAIAvailable();
      const aiResult = await this.aiService.sendMessage(userId, message);
      return {
        success: true,
        text: aiAvailable
          ? aiResult.text
          : `${aiResult.text}\n\nAI đang tạm thời không khả dụng. MealAI đang dùng chế độ lệnh cơ bản.`,
        intent: 'UNKNOWN',
        entities: detection.entities,
        data: aiResult.actionTaken?.result,
        actionTaken: aiResult.actionTaken,
        fallbackMode: !aiAvailable,
        nextAction: 'NONE',
      };
    }

    return this.processKnownIntent(
      userId,
      message,
      detection.intent,
      detection.entities,
      { ...context, pendingConfirmation: undefined },
    );
  }

  async executeAction(
    userId: string,
    intent: ChatbotIntent,
    entities: ChatbotEntities = {},
  ): Promise<ChatbotCommandResponse> {
    const context = await this.loadContext(userId);
    return this.processKnownIntent(
      userId,
      `ACTION:${intent}`,
      intent,
      entities,
      context,
    );
  }

  private async processKnownIntent(
    userId: string,
    message: string,
    intent: ChatbotIntent,
    entities: ChatbotEntities,
    context: ChatbotConversationContext,
  ): Promise<ChatbotCommandResponse> {
    const enriched = this.applyContextDefaults(intent, entities, context);
    const clarification = this.getClarification(intent, enriched);
    if (clarification) {
      const nextContext: ChatbotConversationContext = {
        ...context,
        pendingQuestion: {
          intent,
          entities: enriched,
          missing: clarification.missing,
        },
        lastAction: intent,
      };
      return this.saveResponse(userId, message, {
        success: true,
        text: clarification.text,
        intent,
        entities: enriched,
        nextAction: 'ASK_CLARIFICATION',
      }, nextContext);
    }

    const confirmationPrompt = await this.getConfirmationPrompt(
      userId,
      intent,
      enriched,
    );
    if (confirmationPrompt && !enriched.confirmed) {
      const nextContext: ChatbotConversationContext = {
        ...context,
        pendingConfirmation: {
          intent,
          entities: enriched,
          prompt: confirmationPrompt,
        },
        pendingQuestion: undefined,
        lastAction: intent,
      };
      return this.saveResponse(userId, message, {
        success: true,
        text: confirmationPrompt,
        intent,
        entities: enriched,
        requiresConfirmation: true,
        nextAction: 'CONFIRM',
        quickActions: [
          { label: 'Xác nhận', type: 'prompt', prompt: 'Xác nhận' },
          { label: 'Hủy', type: 'prompt', prompt: 'Hủy' },
        ],
      }, nextContext);
    }

    try {
      const executed = await this.runIntent(userId, intent, enriched, context);
      const result = executed.result;
      if (result?.error) {
        throw new Error(result.error);
      }
      const nextContext = this.updateContext(
        { ...context, pendingConfirmation: undefined, pendingQuestion: undefined },
        intent,
        enriched,
        result,
      );
      const response: ChatbotCommandResponse = {
        success: true,
        text: this.buildSuccessMessage(intent, enriched, result),
        message: this.buildSuccessMessage(intent, enriched, result),
        intent,
        entities: enriched,
        data: result,
        actionTaken: executed.actionName
          ? { name: executed.actionName, args: executed.args, result }
          : undefined,
        quickActions: this.buildQuickActions(intent, enriched, result),
        nextAction: executed.targetRoute ? 'NAVIGATE' : 'NONE',
        targetRoute: executed.targetRoute,
        fallbackMode: !this.aiService.isAIAvailable(),
      };
      if (!this.aiService.isAIAvailable()) {
        response.text +=
          '\n\nAI đang tạm thời không khả dụng. MealAI đang dùng chế độ lệnh cơ bản.';
      }
      return this.saveResponse(userId, message, response, nextContext);
    } catch (error: any) {
      this.logger.error(`Chatbot action ${intent} failed: ${error.message}`, error.stack);
      return this.saveResponse(userId, message, {
        success: false,
        text: `MealAI chưa thể thực hiện thao tác này: ${error.message}`,
        intent,
        entities: enriched,
        nextAction: 'NONE',
      }, { ...context, lastAction: intent });
    }
  }

  private async runIntent(
    userId: string,
    intent: ChatbotIntent,
    entities: ChatbotEntities,
    context: ChatbotConversationContext,
  ): Promise<{ result?: any; actionName?: string; args?: any; targetRoute?: string }> {
    switch (intent) {
      case 'GREETING':
      case 'HELP_COMMANDS':
        return {};
      case 'NAVIGATE_PAGE':
        return {
          result: { success: true, page: entities.route },
          actionName: 'navigate_to',
          args: { page: entities.route },
          targetRoute: entities.route,
        };
      case 'SUGGEST_RECIPE': {
        const args = {
          mealType: entities.mealType || 'lunch',
          limit: 5,
          useAntiWaste: entities.useInventory !== false,
          excludeIds: context.lastSuggestedRecipes.map((recipe) => recipe.id),
        };
        return {
          result: await this.actionHandler.handleAction('get_recommendations', args, userId),
          actionName: 'get_recommendations',
          args,
        };
      }
      case 'SUGGEST_BY_INGREDIENTS': {
        if (entities.useInventory && !entities.ingredients?.length) {
          const args = { mealType: entities.mealType || 'lunch', limit: 5, useAntiWaste: true };
          return {
            result: await this.actionHandler.handleAction('get_recommendations', args, userId),
            actionName: 'get_recommendations',
            args,
          };
        }
        const args = { ...entities, limit: 5 };
        return {
          result: await this.actionHandler.handleAction(
            'search_recipes_by_ingredients',
            args,
            userId,
          ),
          actionName: 'search_recipes_by_ingredients',
          args,
        };
      }
      case 'SEARCH_RECIPE': {
        const args = {
          search: entities.recipeName,
          mealType: entities.mealType,
          maxCookingTime: entities.maxCookingTime,
          maxCalories: entities.maxCalories,
          minProtein: entities.minProtein,
          difficulty: entities.difficulty,
          excludedIngredients: entities.excludedIngredients,
          limit: 8,
        };
        return {
          result: await this.actionHandler.handleAction('search_recipes', args, userId),
          actionName: 'search_recipes',
          args,
        };
      }
      case 'SHOW_FAVORITES': {
        const args = { limit: 10 };
        return {
          result: await this.actionHandler.handleAction('get_favorites', args, userId),
          actionName: 'get_favorites',
          args,
          targetRoute: '/favorites',
        };
      }
      case 'CREATE_MEAL_PLAN': {
        if (entities.period === 'week') {
          const args = {
            weekStart: this.getMondayString(entities.date || new Date()),
            useAntiWaste: entities.useInventory !== false,
            overwrite: !!entities.confirmed,
            servings: entities.servings,
          };
          return {
            result: await this.actionHandler.handleAction('generate_meal_plan', args, userId),
            actionName: 'generate_meal_plan',
            args,
            targetRoute: '/meal-planner',
          };
        }
        const args = {
          mealDates: [entities.date],
          mealType: entities.mealType,
          useAntiWaste: entities.useInventory !== false,
          overwrite: !!entities.confirmed,
          servings: entities.servings,
        };
        return {
          result: await this.actionHandler.handleAction(
            'generate_meal_plan_for_days',
            args,
            userId,
          ),
          actionName: 'generate_meal_plan_for_days',
          args,
          targetRoute: '/meal-planner',
        };
      }
      case 'ADD_RECIPE_TO_MEAL_PLAN': {
        const args = {
          mealDate: entities.date,
          mealType: entities.mealType,
          recipeId: entities.recipeId,
          recipeName: entities.recipeName,
          overwrite: false,
        };
        return {
          result: await this.actionHandler.handleAction('add_to_meal_plan', args, userId),
          actionName: 'add_to_meal_plan',
          args,
          targetRoute: '/meal-planner',
        };
      }
      case 'REPLACE_MEAL_ITEM': {
        const args = {
          mealDate: entities.date,
          mealType: entities.mealType,
          recipeId: entities.recipeId,
          recipeName: entities.recipeName,
          oldRecipeName: entities.oldRecipeName,
          useAntiWaste: true,
        };
        return {
          result: await this.actionHandler.handleAction('replace_meal_item', args, userId),
          actionName: 'replace_meal_item',
          args,
          targetRoute: '/meal-planner',
        };
      }
      case 'REMOVE_MEAL_ITEM': {
        const actionName = entities.scope === 'day'
          ? 'remove_meal_day'
          : 'remove_from_meal_plan';
        const args = {
          mealDate: entities.date,
          mealType: entities.scope === 'day' ? undefined : entities.mealType,
          recipeId: entities.recipeId,
          recipeName: entities.recipeName,
          removeCount: entities.removeCount,
        };
        return {
          result: await this.actionHandler.handleAction(actionName, args, userId),
          actionName,
          args,
          targetRoute: '/meal-planner',
        };
      }
      case 'GENERATE_SHOPPING_LIST': {
        const weekStart = this.getMondayString(entities.date || new Date());
        const plan = await this.actionHandler.handleAction(
          'get_meal_plan',
          { weekStart },
          userId,
        );
        if (!plan?.id) throw new Error('Bạn chưa có thực đơn cho thời gian này.');
        const days = entities.period === 'week'
          ? undefined
          : [this.getMealPlanDay(entities.date || this.formatDate(new Date()))];
        const args = { mealPlanId: plan.id, days };
        return {
          result: await this.actionHandler.handleAction('generate_shopping_list', args, userId),
          actionName: 'generate_shopping_list',
          args,
          targetRoute: '/shopping-list',
        };
      }
      case 'CHECK_INVENTORY': {
        const expiring = !!entities.inventoryQuery &&
          ['sắp hết hạn', 'dùng trước', 'gần hết'].some((term) =>
            String(entities.inventoryQuery).includes(term),
          );
        const actionName = expiring ? 'get_expiring_items' : 'get_inventory';
        const args = {};
        const result = await this.actionHandler.handleAction(actionName, args, userId);
        if (entities.inventoryQuery && result?.data) {
          const query = this.normalize(String(entities.inventoryQuery));
          const ignored = ['sap het han', 'dung truoc', 'gan het'];
          if (!ignored.some((term) => query.includes(term))) {
            result.data = result.data.filter((item: any) =>
              this.normalize(item.ingredient?.name || '').includes(query),
            );
          }
        }
        return { result, actionName, args };
      }
      case 'ADD_INVENTORY_ITEM': {
        const search = await this.actionHandler.handleAction(
          'search_ingredients',
          { query: entities.inventoryQuery },
          userId,
        );
        const ingredient = search?.data?.[0];
        if (!ingredient) {
          throw new Error(`Không tìm thấy nguyên liệu “${entities.inventoryQuery}” trong danh mục.`);
        }
        const args = {
          ingredientId: ingredient.id,
          quantity: entities.quantity,
          unit: entities.unit || ingredient.defaultUnit || 'g',
          expirationDate: entities.expirationDate,
        };
        return {
          result: await this.actionHandler.handleAction('add_to_inventory', args, userId),
          actionName: 'add_to_inventory',
          args: { ...args, ingredientName: ingredient.name },
          targetRoute: '/inventory',
        };
      }
      case 'CHECK_NUTRITION':
      case 'ANALYZE_MEAL_PLAN': {
        const args = {
          mealDate: entities.date,
          period: entities.period,
          weekStart: this.getMondayString(entities.date || new Date()),
        };
        return {
          result: await this.actionHandler.handleAction('analyze_meal_plan', args, userId),
          actionName: 'analyze_meal_plan',
          args,
          targetRoute: '/nutrition',
        };
      }
      default:
        return {};
    }
  }

  private applyContextDefaults(
    intent: ChatbotIntent,
    entities: ChatbotEntities,
    context: ChatbotConversationContext,
  ): ChatbotEntities {
    const result = { ...entities };
    if (['REPLACE_MEAL_ITEM', 'REMOVE_MEAL_ITEM'].includes(intent) && !result.date) {
      result.date = context.lastMealDate || this.formatDate(new Date());
    }
    if (intent === 'REPLACE_MEAL_ITEM' && !result.mealType) {
      result.mealType = context.lastMealType as ChatbotEntities['mealType'];
    }
    if (
      ['ADD_RECIPE_TO_MEAL_PLAN', 'REPLACE_MEAL_ITEM', 'REMOVE_MEAL_ITEM'].includes(intent) &&
      !result.recipeId &&
      !result.recipeName &&
      !(intent === 'REMOVE_MEAL_ITEM' && (result.scope === 'meal' || result.clearMealItems)) &&
      context.lastSelectedRecipe
    ) {
      result.recipeId = context.lastSelectedRecipe.id;
      result.recipeName = context.lastSelectedRecipe.name;
    }
    if (
      ['CREATE_MEAL_PLAN', 'GENERATE_SHOPPING_LIST', 'CHECK_NUTRITION', 'ANALYZE_MEAL_PLAN'].includes(intent) &&
      !result.date
    ) {
      result.date = this.formatDate(new Date());
    }
    if (intent === 'CHECK_INVENTORY' && !result.inventoryQuery) {
      result.inventoryQuery = '';
    }
    return result;
  }

  private getClarification(intent: ChatbotIntent, entities: ChatbotEntities) {
    if (intent === 'ADD_RECIPE_TO_MEAL_PLAN') {
      if (!entities.recipeId && !entities.recipeName) {
        return { missing: 'recipe' as const, text: 'Bạn muốn thêm món nào vào thực đơn?' };
      }
      if (!entities.date) {
        return { missing: 'date' as const, text: 'Bạn muốn thêm món này vào ngày nào?' };
      }
      if (!entities.mealType) {
        return { missing: 'mealType' as const, text: 'Bạn muốn thêm vào bữa sáng, trưa hay tối?' };
      }
    }
    if (intent === 'REPLACE_MEAL_ITEM' && !entities.mealType && !entities.oldRecipeName) {
      return { missing: 'mealType' as const, text: 'Bạn muốn đổi món ở bữa sáng, trưa hay tối?' };
    }
    if (intent === 'REMOVE_MEAL_ITEM' && entities.scope === 'item' && !entities.recipeId && !entities.recipeName) {
      return { missing: 'recipe' as const, text: 'Bạn muốn xóa món nào?' };
    }
    if (intent === 'REMOVE_MEAL_ITEM' && entities.scope === 'meal' && !entities.mealType) {
      return { missing: 'mealType' as const, text: 'Bạn muốn xóa các món ở bữa sáng, trưa hay tối?' };
    }
    if (intent === 'ADD_INVENTORY_ITEM') {
      if (!entities.quantity) {
        return { missing: 'quantity' as const, text: 'Bạn muốn thêm số lượng bao nhiêu?' };
      }
      if (!entities.inventoryQuery) {
        return { missing: 'recipe' as const, text: 'Bạn muốn thêm nguyên liệu nào vào tủ lạnh?' };
      }
    }
    if (intent === 'NAVIGATE_PAGE' && !entities.route) {
      return { missing: 'recipe' as const, text: 'Bạn muốn mở trang nào?' };
    }
    return undefined;
  }

  private async getConfirmationPrompt(
    userId: string,
    intent: ChatbotIntent,
    entities: ChatbotEntities,
  ): Promise<string | undefined> {
    if (intent === 'REMOVE_MEAL_ITEM' && entities.scope === 'day') {
      return `Bạn có chắc muốn xóa toàn bộ thực đơn ngày ${entities.date} không?`;
    }
    if (intent === 'REMOVE_MEAL_ITEM' && entities.scope === 'meal') {
      return `Bạn có chắc muốn xóa toàn bộ ${this.mealLabel(entities.mealType)} ngày ${entities.date} không?`;
    }
    if (intent === 'CREATE_MEAL_PLAN') {
      const weekStart = this.getMondayString(entities.date || new Date());
      const plan = await this.actionHandler.handleAction(
        'get_meal_plan',
        { weekStart },
        userId,
      );
      if (plan?.items?.length) {
        const hasConflict = entities.period === 'week' || plan.items.some((item: any) =>
          this.formatDate(item.mealDate) === entities.date &&
          (!entities.mealType || item.mealType === entities.mealType),
        );
        if (hasConflict) {
          return 'Thực đơn đã có món. Bạn có chắc muốn tạo lại và thay thế các món hiện tại không?';
        }
      }
    }
    if (intent === 'ADD_RECIPE_TO_MEAL_PLAN') {
      const user = await this.userRepo.findOne({
        where: { id: userId },
        relations: ['preferences'],
      });
      const servings = Number(user?.preferences?.servings);
      if (!Number.isInteger(servings) || servings < 1 || servings > 20) {
        return 'Vui lòng nhập số người ăn trong hồ sơ cá nhân trước khi thêm món vào thực đơn.';
      }
      const weekStart = this.getMondayString(entities.date || new Date());
      const plan = await this.actionHandler.handleAction('get_meal_plan', { weekStart }, userId);
      const dayCount = plan?.items?.filter(
        (item: any) => this.formatDate(item.mealDate) === entities.date,
      ).length || 0;
      if (dayCount + 1 > getMaxRecommendedDishes(servings)) {
        return `Thực đơn đã đạt giới hạn món cho ${servings} người ăn hiện tại. Bạn vẫn muốn thêm không?`;
      }
    }
    return undefined;
  }

  private updateContext(
    context: ChatbotConversationContext,
    intent: ChatbotIntent,
    entities: ChatbotEntities,
    result: any,
  ): ChatbotConversationContext {
    const next = { ...context, lastAction: intent };
    if (entities.date) next.lastMealDate = entities.date;
    if (entities.mealType) next.lastMealType = entities.mealType;
    const recipes = this.normalizeRecipes(result).slice(0, 10).map((recipe: any) => ({
      id: recipe.id,
      name: recipe.name,
    }));
    if (recipes.length) {
      next.lastSuggestedRecipes = recipes;
      next.lastSelectedRecipe = recipes[0];
    } else if (entities.recipeId || entities.recipeName) {
      next.lastSelectedRecipe = {
        id: entities.recipeId || context.lastSelectedRecipe?.id || '',
        name: entities.recipeName || context.lastSelectedRecipe?.name || '',
      };
    }
    return next;
  }

  private buildSuccessMessage(intent: ChatbotIntent, entities: ChatbotEntities, result: any): string {
    const recipes = this.normalizeRecipes(result);
    switch (intent) {
      case 'GREETING':
        return 'Xin chào! Mình là trợ lý MealAI. Bạn muốn gợi ý món, lên thực đơn hay kiểm tra tủ lạnh?';
      case 'HELP_COMMANDS':
        return [
          'MealAI có thể thực hiện trực tiếp các nhóm lệnh sau:',
          '- Gợi ý món: “Gợi ý món từ thịt bò”',
          '- Tạo thực đơn: “Tạo thực đơn hôm nay cho 4 người”',
          '- Thêm/đổi/xóa món trong thực đơn',
          '- Tạo danh sách mua sắm từ thực đơn',
          '- Kiểm tra hoặc thêm nguyên liệu vào tủ lạnh',
          '- Phân tích calories, protein, carbs và fat',
          '- Tìm công thức, xem món yêu thích và mở đúng trang',
        ].join('\n');
      case 'NAVIGATE_PAGE':
        return `Đã mở ${this.routeLabel(entities.route)} cho bạn.`;
      case 'SUGGEST_RECIPE':
      case 'SUGGEST_BY_INGREDIENTS':
      case 'SEARCH_RECIPE':
      case 'SHOW_FAVORITES':
        return recipes.length
          ? `Mình tìm thấy ${recipes.length} món phù hợp: ${recipes.slice(0, 5).map((r: any) => r.name).join(', ')}.`
          : 'Chưa tìm thấy món phù hợp với các điều kiện hiện tại.';
      case 'CREATE_MEAL_PLAN':
        return 'Đã tạo thực đơn cho bạn. Bạn có thể xem tại trang Thực đơn.';
      case 'ADD_RECIPE_TO_MEAL_PLAN':
        return `Đã thêm ${entities.recipeName || 'món đã chọn'} vào ${this.mealLabel(entities.mealType)} ngày ${entities.date}.`;
      case 'REPLACE_MEAL_ITEM':
        return result?.message || `Đã đổi món thành ${result?.newRecipeName || entities.recipeName || 'món phù hợp khác'}.`;
      case 'REMOVE_MEAL_ITEM':
        return result?.message || 'Đã xóa món khỏi thực đơn.';
      case 'GENERATE_SHOPPING_LIST':
        return 'Đã tạo danh sách mua sắm. Một số nguyên liệu đã được trừ từ tủ lạnh.';
      case 'CHECK_INVENTORY': {
        const items = result?.data || [];
        return items.length
          ? `Tủ lạnh hiện có ${items.length} nguyên liệu. ${items.slice(0, 6).map((item: any) => `${item.ingredient?.name}: ${item.availableQuantity ?? item.quantity} ${item.unit}`).join('; ')}.`
          : 'Không tìm thấy nguyên liệu phù hợp trong tủ lạnh.';
      }
      case 'ADD_INVENTORY_ITEM':
        return `Đã thêm ${entities.quantity}${entities.unit || ''} ${entities.inventoryQuery} vào tủ lạnh.`;
      case 'CHECK_NUTRITION':
      case 'ANALYZE_MEAL_PLAN':
        return `Dinh dưỡng ${entities.period === 'week' ? 'trung bình tuần' : 'trong ngày'}: ${Math.round(Number(result?.calories || 0))} kcal, ${Math.round(Number(result?.protein || 0))}g protein, ${Math.round(Number(result?.carbs || 0))}g carbs, ${Math.round(Number(result?.fat || 0))}g chất béo, ${result?.totalDishes || 0} món.`;
      default:
        return result?.message || 'Đã thực hiện yêu cầu thành công.';
    }
  }

  private buildQuickActions(
    intent: ChatbotIntent,
    entities: ChatbotEntities,
    result: any,
  ): ChatbotQuickAction[] {
    if (['SUGGEST_RECIPE', 'SUGGEST_BY_INGREDIENTS', 'SEARCH_RECIPE'].includes(intent)) {
      const recipe = this.normalizeRecipes(result)[0];
      const actions: ChatbotQuickAction[] = [];
      if (recipe) {
        actions.push({ label: 'Xem chi tiết', type: 'navigate', route: `/recipes/${recipe.id}` });
        actions.push({
          label: 'Thêm vào thực đơn',
          type: 'prompt',
          prompt: `Thêm ${recipe.name} vào thực đơn`,
        });
      }
      actions.push({ label: 'Đổi món khác', type: 'prompt', prompt: 'Gợi ý món khác' });
      return actions;
    }
    const routes: Partial<Record<ChatbotIntent, [string, string]>> = {
      CREATE_MEAL_PLAN: ['Xem thực đơn', '/meal-planner'],
      ADD_RECIPE_TO_MEAL_PLAN: ['Xem thực đơn', '/meal-planner'],
      REPLACE_MEAL_ITEM: ['Xem thực đơn', '/meal-planner'],
      REMOVE_MEAL_ITEM: ['Xem thực đơn', '/meal-planner'],
      GENERATE_SHOPPING_LIST: ['Xem danh sách mua sắm', '/shopping-list'],
      CHECK_INVENTORY: ['Xem tủ lạnh', '/inventory'],
      ADD_INVENTORY_ITEM: ['Xem tủ lạnh', '/inventory'],
      CHECK_NUTRITION: ['Xem Dinh dưỡng & AI Insights', '/nutrition'],
      ANALYZE_MEAL_PLAN: ['Xem Dinh dưỡng & AI Insights', '/nutrition'],
      SHOW_FAVORITES: ['Mở công thức yêu thích', '/favorites'],
    };
    const route = routes[intent];
    return route ? [{ label: route[0], type: 'navigate', route: route[1] }] : [];
  }

  private async saveResponse(
    userId: string,
    userContent: string,
    response: ChatbotCommandResponse,
    context: ChatbotConversationContext,
  ): Promise<ChatbotCommandResponse> {
    const userMessage = this.chatMessageRepo.create({
      userId,
      role: 'user',
      content: userContent,
    });
    const assistantMessage = this.chatMessageRepo.create({
      userId,
      role: 'model',
      content: response.text,
      metadata: {
        ...(response.actionTaken || {}),
        intent: response.intent,
        entities: response.entities,
        quickActions: response.quickActions,
        requiresConfirmation: response.requiresConfirmation,
        nextAction: response.nextAction,
        targetRoute: response.targetRoute,
        fallbackMode: response.fallbackMode,
        context,
      },
    });
    await this.chatMessageRepo.save([userMessage, assistantMessage]);
    return response;
  }

  private async loadContext(userId: string): Promise<ChatbotConversationContext> {
    const lastModelMessage = await this.chatMessageRepo.findOne({
      where: { userId, role: 'model' },
      order: { createdAt: 'DESC' },
    });
    return {
      ...EMPTY_CHATBOT_CONTEXT,
      ...(lastModelMessage?.metadata?.context || {}),
      lastSuggestedRecipes:
        lastModelMessage?.metadata?.context?.lastSuggestedRecipes || [],
    };
  }

  private normalizeRecipes(result: any): any[] {
    const source = Array.isArray(result)
      ? result
      : Array.isArray(result?.recommendations)
        ? result.recommendations
        : Array.isArray(result?.data?.recommendations)
          ? result.data.recommendations
          : Array.isArray(result?.data)
            ? result.data
            : [];
    return source.map((item: any) => item?.recipe || item).filter((item: any) => item?.id);
  }

  private mealLabel(mealType?: string): string {
    return mealType === 'breakfast'
      ? 'bữa sáng'
      : mealType === 'lunch'
        ? 'bữa trưa'
        : mealType === 'dinner'
          ? 'bữa tối'
          : 'bữa ăn';
  }

  private routeLabel(route?: string): string {
    const labels: Record<string, string> = {
      '/meal-planner': 'trang Thực đơn',
      '/shopping-list': 'trang Mua sắm',
      '/inventory': 'Tủ lạnh',
      '/nutrition': 'trang Dinh dưỡng',
      '/profile': 'trang Cá nhân',
      '/favorites': 'Công thức yêu thích',
      '/admin': 'trang Quản trị',
      '/recipes': 'trang Công thức',
      '/': 'trang chủ',
    };
    return labels[route || ''] || 'trang bạn yêu cầu';
  }

  private getMondayString(value: string | Date): string {
    const date = new Date(value);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    return this.formatDate(date);
  }

  private getMealPlanDay(value: string): number {
    const day = new Date(`${value}T00:00:00`).getDay();
    return day === 0 ? 7 : day;
  }

  private formatDate(value: string | Date): string {
    const date = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T00:00:00`);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .toLowerCase()
      .trim();
  }
}
