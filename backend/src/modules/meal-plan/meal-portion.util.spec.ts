import { calculateMealPortionWarning } from './meal-portion.util';

describe('calculateMealPortionWarning', () => {
  it('warns for 1 person when the menu has more than 6 dishes per day', () => {
    const result = calculateMealPortionWarning({
      servings: 1,
      totalDishes: 7,
      dailyCalories: 2000,
    });

    expect(result.shouldWarn).toBe(true);
    expect(result.maxRecommendedDishes).toBe(6);
    expect(result.dailyCaloriesPerPerson).toBe(2000);
    expect(result.totalFamilyCaloriesNeeded).toBe(2000);
    expect(result.totalCaloriesNeeded).toBe(2000);
    expect(result.totalPortions).toBe(7);
  });

  it('warns for 2 people when the menu has more than 8 dishes per day', () => {
    const result = calculateMealPortionWarning({
      servings: 2,
      totalDishes: 9,
      dailyCalories: 2200,
    });

    expect(result.shouldWarn).toBe(true);
    expect(result.maxRecommendedDishes).toBe(8);
    expect(result.dailyCaloriesPerPerson).toBe(2200);
    expect(result.totalFamilyCaloriesNeeded).toBe(4400);
    expect(result.totalCaloriesNeeded).toBe(4400);
    expect(result.totalPortions).toBe(18);
  });

  it('warns for 4 people when the menu has more than 11 dishes per day', () => {
    const result = calculateMealPortionWarning({
      servings: 4,
      totalDishes: 12,
      dailyCalories: 2100,
    });

    expect(result.shouldWarn).toBe(true);
    expect(result.maxRecommendedDishes).toBe(11);
    expect(result.dailyCaloriesPerPerson).toBe(2100);
    expect(result.totalFamilyCaloriesNeeded).toBe(8400);
    expect(result.totalCaloriesNeeded).toBe(8400);
    expect(result.totalPortions).toBe(48);
  });

  it('keeps the calorie target per person separate from the family total', () => {
    const result = calculateMealPortionWarning({
      servings: 4,
      totalDishes: 12,
      dailyCalories: 2266,
    });

    expect(result.dailyCaloriesPerPerson).toBe(2266);
    expect(result.totalFamilyCaloriesNeeded).toBe(9064);
    expect(result.totalCaloriesNeeded).toBe(9064);
  });

  it('warns for 6 people when the menu has more than 14 dishes per day', () => {
    const result = calculateMealPortionWarning({
      servings: 6,
      totalDishes: 15,
      dailyCalories: 2300,
    });

    expect(result.shouldWarn).toBe(true);
    expect(result.maxRecommendedDishes).toBe(14);
    expect(result.dailyCaloriesPerPerson).toBe(2300);
    expect(result.totalFamilyCaloriesNeeded).toBe(13800);
    expect(result.totalCaloriesNeeded).toBe(13800);
    expect(result.totalPortions).toBe(90);
  });
});
