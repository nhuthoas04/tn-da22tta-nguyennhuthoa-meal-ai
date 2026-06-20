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

  if (servings <= 1) return 5;
  if (servings <= 2) return 8;
  if (servings <= 4) return 12;
  if (servings <= 6) return 15;

  return Math.ceil(servings * 2.5);
}

export function getMaxDishesByServings(servings: number): number {
  return getMaxRecommendedDishes(servings);
}

export function calculateMealPortionWarning(
  input: MealPortionWarningInput,
  isAiGenerated = false,
): MealPortionWarningResult {
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
