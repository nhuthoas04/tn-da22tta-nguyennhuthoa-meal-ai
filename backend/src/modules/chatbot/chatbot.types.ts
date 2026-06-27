export const CHATBOT_INTENTS = [
  'GREETING',
  'SUGGEST_RECIPE',
  'SUGGEST_BY_INGREDIENTS',
  'CREATE_MEAL_PLAN',
  'ADD_RECIPE_TO_MEAL_PLAN',
  'REPLACE_MEAL_ITEM',
  'REMOVE_MEAL_ITEM',
  'GENERATE_SHOPPING_LIST',
  'CHECK_INVENTORY',
  'ADD_INVENTORY_ITEM',
  'CHECK_NUTRITION',
  'ANALYZE_MEAL_PLAN',
  'SHOW_FAVORITES',
  'SEARCH_RECIPE',
  'NAVIGATE_PAGE',
  'HELP_COMMANDS',
  'UNKNOWN',
] as const;

export type ChatbotIntent = (typeof CHATBOT_INTENTS)[number];

export interface ChatbotEntities {
  date?: string;
  dates?: string[];
  period?: 'day' | 'week';
  mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  recipeId?: string;
  recipeName?: string;
  oldRecipeName?: string;
  ingredients?: string[];
  excludedIngredients?: string[];
  servings?: number;
  quantity?: number;
  unit?: string;
  expirationDate?: string;
  inventoryQuery?: string;
  route?: string;
  maxCookingTime?: number;
  maxCalories?: number;
  minProtein?: number;
  difficulty?: string;
  useInventory?: boolean;
  scope?: 'item' | 'meal' | 'day' | 'week';
  overwrite?: boolean;
  confirmed?: boolean;
  [key: string]: unknown;
}

export interface IntentDetectionResult {
  intent: ChatbotIntent;
  confidence: number;
  entities: ChatbotEntities;
}

export interface SuggestedRecipeContext {
  id: string;
  name: string;
}

export interface PendingConfirmation {
  intent: ChatbotIntent;
  entities: ChatbotEntities;
  prompt: string;
}

export interface PendingQuestion {
  intent: ChatbotIntent;
  entities: ChatbotEntities;
  missing: 'date' | 'mealType' | 'quantity' | 'recipe';
}

export interface ChatbotConversationContext {
  lastSuggestedRecipes: SuggestedRecipeContext[];
  lastSelectedRecipe?: SuggestedRecipeContext;
  lastMealDate?: string;
  lastMealType?: string;
  lastAction?: ChatbotIntent;
  pendingConfirmation?: PendingConfirmation;
  pendingQuestion?: PendingQuestion;
}

export interface ChatbotQuickAction {
  label: string;
  type: 'prompt' | 'navigate' | 'action';
  prompt?: string;
  route?: string;
  intent?: ChatbotIntent;
  entities?: ChatbotEntities;
}

export interface ChatbotCommandResponse {
  success: boolean;
  reason?: string;
  text: string;
  message?: string;
  intent: ChatbotIntent;
  entities: ChatbotEntities;
  data?: any;
  actionTaken?: any;
  quickActions?: ChatbotQuickAction[];
  requiresConfirmation?: boolean;
  nextAction?: 'NAVIGATE' | 'CONFIRM' | 'ASK_CLARIFICATION' | 'NONE';
  targetRoute?: string;
  fallbackMode?: boolean;
}

export const EMPTY_CHATBOT_CONTEXT: ChatbotConversationContext = {
  lastSuggestedRecipes: [],
};
