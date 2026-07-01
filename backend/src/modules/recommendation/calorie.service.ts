import { Injectable } from '@nestjs/common';
import { User } from '../auth/entities/user.entity';
import {
  HEALTH_CONDITIONS,
  parseHealthConditions,
} from './health-goal.constants';

export type UserCalorieTargets = {
  tdee: number | null;
  adjustedDailyTarget: number | null;
  goal: 'weight_loss' | 'muscle_gain' | 'maintenance';
  meals: {
    breakfast: number;
    lunch: number;
    dinner: number;
  };
};

/**
 * Calorie Calculator Service
 *
 * Uses the Mifflin-St Jeor equation to calculate BMR and TDEE.
 * This is the medically-validated formula recommended by the
 * American Dietetic Association.
 */
@Injectable()
export class CalorieService {
  // Activity level multipliers for TDEE calculation
  private readonly ACTIVITY_FACTORS: Record<string, number> = {
    sedentary: 1.2, // Office work, little exercise
    light: 1.375, // Light exercise 1-3 days/week
    moderate: 1.55, // Moderate exercise 3-5 days/week
    active: 1.725, // Hard exercise 6-7 days/week
    very_active: 1.9, // Athlete-level training
  };

  // Vietnamese family meal distribution
  private readonly MEAL_DISTRIBUTION = {
    breakfast: 0.3, // 30% — Energy for morning
    lunch: 0.4, // 40% — Main meal of the day
    dinner: 0.3, // 30% — Light recovery meal
  };

  /**
   * Calculate Total Daily Energy Expenditure (TDEE)
   *
   * Step 1: BMR using Mifflin-St Jeor
   *   Male:   BMR = 10×W + 6.25×H − 5×A + 5
   *   Female: BMR = 10×W + 6.25×H − 5×A − 161
   *
   * Step 2: TDEE = BMR × Activity Factor
   */
  calculateTDEE(user: User): number | null {
    if (!user.weight || !user.height || !user.gender || !user.dateOfBirth) {
      return null; // Not enough data
    }

    const gender = user.gender.trim().toLowerCase();
    if (gender !== 'male' && gender !== 'female') {
      return null;
    }

    const weight = Number(user.weight);
    const height = Number(user.height);
    if (isNaN(weight) || isNaN(height) || weight <= 0 || height <= 0) {
      return null;
    }

    const birthDate = new Date(user.dateOfBirth);
    if (isNaN(birthDate.getTime())) {
      return null;
    }

    const age = this.calculateAge(birthDate);
    if (age < 0 || isNaN(age)) {
      return null;
    }

    // Step 1: Mifflin-St Jeor BMR
    let bmr: number;
    if (gender === 'male') {
      bmr = 10 * weight + 6.25 * height - 5 * age + 5;
    } else {
      bmr = 10 * weight + 6.25 * height - 5 * age - 161;
    }

    // Step 2: Apply activity factor
    const activityFactor = this.ACTIVITY_FACTORS[user.activityLevel] || 1.55;
    const tdee = Math.round(bmr * activityFactor);

    return tdee;
  }

  getAdjustedDailyCalorieTarget(
    tdee: number | null,
    gender?: string | null,
    healthConditions?: string | null,
  ): number | null {
    if (!tdee || !Number.isFinite(Number(tdee)) || Number(tdee) <= 0) {
      return null;
    }

    const conditions = parseHealthConditions(healthConditions);
    if (conditions.includes(HEALTH_CONDITIONS.WEIGHT_LOSS)) {
      const minimum = gender?.toLowerCase() === 'male' ? 1500 : 1200;
      return Math.max(minimum, Math.round(Number(tdee) * 0.85));
    }

    if (conditions.includes(HEALTH_CONDITIONS.MUSCLE_GAIN)) {
      return Math.round(Number(tdee) * 1.1);
    }

    return Math.round(Number(tdee));
  }

  getUserCalorieTargets(user: User): UserCalorieTargets {
    const tdee = Number(user?.dailyCalorieTarget) || this.calculateTDEE(user);
    const conditions = parseHealthConditions(
      user?.preferences?.healthConditions,
    );
    const adjustedDailyTarget = this.getAdjustedDailyCalorieTarget(
      tdee,
      user?.gender,
      user?.preferences?.healthConditions,
    );
    const goal = conditions.includes(HEALTH_CONDITIONS.WEIGHT_LOSS)
      ? 'weight_loss'
      : conditions.includes(HEALTH_CONDITIONS.MUSCLE_GAIN)
        ? 'muscle_gain'
        : 'maintenance';

    return {
      tdee,
      adjustedDailyTarget,
      goal,
      meals: this.getMealDistribution(adjustedDailyTarget),
    };
  }

  /**
   * Distribute daily calories across meals
   * Returns calorie targets for each meal type
   */
  getMealDistribution(dailyCalories: number | null) {
    if (!dailyCalories || isNaN(dailyCalories) || dailyCalories <= 0) {
      return { breakfast: 600, lunch: 800, dinner: 600 }; // Defaults
    }

    return {
      breakfast: Math.round(dailyCalories * this.MEAL_DISTRIBUTION.breakfast),
      lunch: Math.round(dailyCalories * this.MEAL_DISTRIBUTION.lunch),
      dinner: Math.round(dailyCalories * this.MEAL_DISTRIBUTION.dinner),
    };
  }

  /**
   * Calculate calorie target for a specific meal type
   */
  getTargetForMeal(dailyCalories: number | null, mealType: string): number {
    const distribution = this.getMealDistribution(dailyCalories);
    return distribution[mealType] || 700;
  }

  private calculateAge(dateOfBirth: Date): number {
    const today = new Date();
    const birth = new Date(dateOfBirth);
    if (isNaN(birth.getTime())) return 0;
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birth.getDate())
    ) {
      age--;
    }
    return age;
  }
}
