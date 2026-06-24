import { getMaxRecommendedDishes, getMealSlotLimit } from './mealPortion';

export type MealType = 'breakfast' | 'lunch' | 'dinner';

export type MealPlanValidationResult =
  | { ok: true; warning?: string; duplicateInDay?: boolean }
  | { ok: false; message: string };

export function parseDateInput(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayInputValue() {
  return formatDateInput(new Date());
}

export function getMonday(date: Date): string {
  const target = new Date(date);
  const day = target.getDay();
  const diff = target.getDate() - day + (day === 0 ? -6 : 1);
  target.setDate(diff);
  return formatDateInput(target);
}

export function getMealPlanDay(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

export function isPastMealDate(dateString: string): boolean {
  return dateString < getTodayInputValue();
}

export function isPastMealSlot(dateString: string, mealType: string): boolean {
  if (isPastMealDate(dateString)) return true;
  if (dateString > getTodayInputValue()) return false;

  const currentHour = new Date().getHours();
  if (mealType === 'breakfast') return currentHour >= 10;
  if (mealType === 'lunch') return currentHour >= 14;
  if (mealType === 'dinner') return currentHour >= 21;
  return false;
}

export function getFirstAvailableMeal(dateString: string): MealType {
  if (!isPastMealSlot(dateString, 'breakfast')) return 'breakfast';
  if (!isPastMealSlot(dateString, 'lunch')) return 'lunch';
  if (!isPastMealSlot(dateString, 'dinner')) return 'dinner';
  return 'breakfast';
}

export function checkDuplicateRecipeInMeal(items: any[], recipeId: string, mealType: string) {
  return items.some((item) => item.recipeId === recipeId && item.mealType === mealType);
}

export function checkDuplicateRecipeInDay(items: any[], recipeId: string) {
  return items.some((item) => item.recipeId === recipeId);
}

export function checkMealPlanPortionWarning(
  dayItems: any[],
  mealType: string,
  servings: number,
  addedCount = 1,
) {
  const slotCount = dayItems.filter((item) => item.mealType === mealType && item.recipe).length;
  const dayCount = dayItems.filter((item) => item.recipe).length;
  const slotLimit = getMealSlotLimit(servings, mealType);
  const dayLimit = getMaxRecommendedDishes(servings);

  if (slotCount + addedCount > slotLimit) {
    return 'Bữa này có quá nhiều món so với số người ăn. Bạn có muốn vẫn thêm món không?';
  }

  if (dayCount + addedCount > dayLimit) {
    return 'Thực đơn hiện tại có thể quá nhiều đối với số người ăn.';
  }

  return '';
}

export function validateAddRecipeToMealPlan(params: {
  dateString: string;
  mealType: string;
  recipeId: string;
  dayItems: any[];
  servings: number;
}): MealPlanValidationResult {
  const { dateString, mealType, recipeId, dayItems, servings } = params;

  if (isPastMealDate(dateString)) {
    return { ok: false, message: 'Không thể thêm món vào ngày đã qua.' };
  }

  if (isPastMealSlot(dateString, mealType)) {
    return { ok: false, message: 'Bữa này đã qua, không thể thêm món.' };
  }

  const slotItems = dayItems.filter((item) => item.mealType === mealType && item.recipe);
  if (slotItems.some((item) => item.isLocked)) {
    return { ok: false, message: 'Bữa ăn này đã được khóa, không thể thêm món.' };
  }

  if (checkDuplicateRecipeInMeal(dayItems, recipeId, mealType)) {
    return { ok: false, message: 'Món này đã có trong bữa đã chọn.' };
  }

  const warning = checkMealPlanPortionWarning(dayItems, mealType, servings, 1);
  return {
    ok: true,
    warning,
    duplicateInDay: checkDuplicateRecipeInDay(dayItems, recipeId),
  };
}
