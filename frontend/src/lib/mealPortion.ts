export interface MealPortionWarningInput {
  servings: number;
  totalDishes: number;
  dailyCalories?: number | null;
}

export interface MealPortionWarningResult {
  shouldWarn: boolean;
  servings: number;
  totalDishes: number;
  maxRecommendedDishes: number;
  dailyCaloriesPerPerson: number;
  totalFamilyCaloriesNeeded: number;
  /** @deprecated Use totalFamilyCaloriesNeeded for family-level display. */
  totalCaloriesNeeded: number;
  totalPortions: number;
  message: string | null;
}

export function getMaxRecommendedDishes(servingsInput: number): number {
  const servings = Math.max(1, Math.floor(Number(servingsInput) || 1));

  if (servings <= 1) return 6;
  if (servings <= 2) return 8;
  if (servings <= 4) return 11;
  if (servings <= 6) return 14;

  return Math.ceil(servings * 2.5);
}

export function getMealSlotLimit(servingsInput: number, mealType: string): number {
  const servings = Math.max(1, Math.floor(Number(servingsInput) || 1));

  if (servings <= 1) return 2;
  if (servings === 2) return mealType === 'breakfast' ? 2 : 3;
  if (servings <= 4) return mealType === 'breakfast' ? 3 : 4;
  if (servings <= 6) return mealType === 'breakfast' ? 4 : 5;

  const max = getMaxRecommendedDishes(servings);
  const breakfast = Math.max(4, Math.round(max * 0.28));
  const lunch = Math.max(5, Math.round((max - breakfast) / 2));
  if (mealType === 'breakfast') return breakfast;
  if (mealType === 'lunch') return lunch;
  return Math.max(5, max - breakfast - lunch);
}

export function getMaxDishesByServings(servings: number): number {
  return getMaxRecommendedDishes(servings);
}

export function calculateMealPortionWarning(input: MealPortionWarningInput, isAiGenerated = false): MealPortionWarningResult {
  const servings = Math.max(1, Math.floor(Number(input.servings) || 1));
  const totalDishes = Math.max(0, Math.floor(Number(input.totalDishes) || 0));
  const dailyCalories = Math.max(0, Number(input.dailyCalories) || 0);
  const maxRecommendedDishes = getMaxRecommendedDishes(servings);
  const shouldWarn = totalDishes > maxRecommendedDishes;

  let message = null;
  if (shouldWarn) {
    message = isAiGenerated
      ? `Thực đơn hiện tại có thể quá nhiều đối với ${servings} người ăn.`
      : 'Bạn đã vượt số lượng món khuyến nghị cho số người ăn hiện tại.';
  }

  return {
    shouldWarn,
    servings,
    totalDishes,
    maxRecommendedDishes,
    dailyCaloriesPerPerson: Math.round(dailyCalories),
    totalFamilyCaloriesNeeded: Math.round(dailyCalories * servings),
    totalCaloriesNeeded: Math.round(dailyCalories * servings),
    totalPortions: totalDishes * servings,
    message,
  };
}

export function getDishCountLimit(peopleCount: number) {
  if (peopleCount <= 1) return 2;
  if (peopleCount === 2) return 4;
  if (peopleCount <= 4) return 6;
  return 8;
}

export function getMealTargetCalories(tdee: number, mealType: string) {
  if (!tdee || tdee <= 0) return null;

  if (mealType === 'breakfast') return Math.round(tdee * 0.3);
  if (mealType === 'lunch') return Math.round(tdee * 0.4);
  if (mealType === 'dinner') return Math.round(tdee * 0.3);

  return null;
}

export function getItemsCalories(items: any[]) {
  return items.reduce((total, item) => {
    return total + Number(item.recipe?.calories || item.calories || 0);
  }, 0);
}

export interface CheckMealPlanWarningsInput {
  peopleCount: number;
  tdee: number;
  mealType: string;
  currentDayItems: any[];
  currentMealItems: any[];
  newRecipes: any[];
}

export function checkMealPlanWarnings({
  peopleCount,
  tdee,
  mealType,
  currentDayItems,
  currentMealItems,
  newRecipes,
}: CheckMealPlanWarningsInput) {
  const currentDishCount = currentDayItems.length;
  const newDishCount = newRecipes.length;
  const maxDishCount = getDishCountLimit(peopleCount);

  const currentDayCalories = getItemsCalories(currentDayItems);
  const currentMealCalories = getItemsCalories(currentMealItems);
  const newCalories = newRecipes.reduce((total, recipe) => {
    return total + Number(recipe.calories || 0);
  }, 0);

  const afterAddDayCalories = currentDayCalories + newCalories;
  const mealTargetCalories = getMealTargetCalories(tdee, mealType);
  const afterAddMealCalories = currentMealCalories + newCalories;

  return {
    exceedDishLimit: currentDishCount + newDishCount > maxDishCount,
    exceedDayCalories: tdee ? afterAddDayCalories > tdee * 1.1 : false,
    exceedMealCalories: mealTargetCalories && mealType
      ? afterAddMealCalories > mealTargetCalories * 1.15
      : false,
    currentDishCount,
    newDishCount,
    maxDishCount,
    currentDayCalories,
    currentMealCalories,
    newCalories,
    afterAddDayCalories,
    afterAddMealCalories,
    dayTargetCalories: tdee,
    mealTargetCalories,
  };
}
