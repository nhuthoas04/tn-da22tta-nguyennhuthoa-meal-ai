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
    totalCaloriesNeeded: Math.round(dailyCalories * servings),
    totalPortions: totalDishes * servings,
    message,
  };
}
