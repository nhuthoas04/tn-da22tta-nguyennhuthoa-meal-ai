import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WeeklyNutritionAnalysis } from './entities/weekly-nutrition-analysis.entity';
import { MealPlan } from '../meal-plan/entities/meal-plan.entity';
import { User } from '../auth/entities/user.entity';

type NutritionAnalysisResponse = Omit<
  WeeklyNutritionAnalysis,
  'nutritionScore'
> & {
  analysis: string;
  dataDays: number;
  incompleteNutritionCount: number;
  targetCalories: number | null;
};

@Injectable()
export class NutritionAnalyzerService {
  private readonly logger = new Logger(NutritionAnalyzerService.name);

  constructor(
    @InjectRepository(WeeklyNutritionAnalysis)
    private readonly analysisRepo: Repository<WeeklyNutritionAnalysis>,
    @InjectRepository(MealPlan)
    private readonly mealPlanRepo: Repository<MealPlan>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async analyzeWeeklyPlan(
    userId: string,
    weekStart: string,
  ): Promise<NutritionAnalysisResponse | null> {
    this.logger.log(
      `Analyzing weekly nutrition for user: ${userId}, weekStart: ${weekStart}`,
    );

    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['preferences'],
    });
    if (!user) return null;

    const mealPlan = await this.mealPlanRepo.findOne({
      where: { userId, weekStart: new Date(weekStart) },
      relations: ['items', 'items.recipe'],
    });

    const items = (mealPlan?.items || []).filter((item) => item.recipe);
    if (items.length === 0) {
      this.logger.warn(`No meal plan items found for week: ${weekStart}`);
      return null;
    }

    const activeDates = new Set(
      items.map((item) => this.formatDateInput(new Date(item.mealDate))),
    );
    const dataDays = activeDates.size;
    const targetCalories = this.toPositiveNumber(user.dailyCalorieTarget);

    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;
    let incompleteNutritionCount = 0;
    let friedCount = 0;
    const recipeCounts = new Map<string, number>();

    for (const item of items) {
      const recipe = item.recipe;
      const calories = Number(recipe.calories) || 0;
      const protein = Number(recipe.protein) || 0;
      const carbs = Number(recipe.carbs) || 0;
      const fat = Number(recipe.fat) || 0;

      totalCalories += calories;
      totalProtein += protein;
      totalCarbs += carbs;
      totalFat += fat;

      if (calories <= 0 || (protein === 0 && carbs === 0 && fat === 0)) {
        incompleteNutritionCount += 1;
      }

      const normalizedName = recipe.name.toLocaleLowerCase('vi-VN');
      const normalizedTags = (recipe.tags || []).map((tag) =>
        tag.toLocaleLowerCase('vi-VN'),
      );
      if (
        normalizedTags.some((tag) => ['chiên', 'rán', 'quay'].includes(tag)) ||
        ['chiên', 'rán', 'quay'].some((keyword) =>
          normalizedName.includes(keyword),
        )
      ) {
        friedCount += 1;
      }

      recipeCounts.set(recipe.id, (recipeCounts.get(recipe.id) || 0) + 1);
    }

    const averageCalories = Math.round(totalCalories / dataDays);
    const averageProtein = Math.round((totalProtein / dataDays) * 10) / 10;
    const calorieRatio = targetCalories
      ? averageCalories / targetCalories
      : null;
    const macroCalories = totalProtein * 4 + totalCarbs * 4 + totalFat * 9;
    const proteinPercent = macroCalories
      ? Math.round(((totalProtein * 4) / macroCalories) * 100)
      : 0;
    const fatPercent = macroCalories
      ? Math.round(((totalFat * 9) / macroCalories) * 100)
      : 0;
    const repeatedRecipeCount = Array.from(recipeCounts.values()).filter(
      (count) => count > 2,
    ).length;

    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const recommendations: string[] = [];

    const analysis = this.buildOverallAnalysis({
      dataDays,
      averageCalories,
      targetCalories,
      calorieRatio,
    });

    if (dataDays >= 3) {
      if (calorieRatio !== null && calorieRatio >= 0.7 && calorieRatio <= 1) {
        strengths.push(
          `Calories trung bình ${averageCalories.toLocaleString('vi-VN')} kcal/ngày, tương đối phù hợp với mục tiêu ${targetCalories?.toLocaleString('vi-VN')} kcal/ngày.`,
        );
      }
      strengths.push(
        `Protein trung bình từ các ngày có thực đơn là ${averageProtein.toLocaleString('vi-VN')}g/ngày. Đây là số liệu ghi nhận, chưa phải kết luận đủ hoặc thiếu protein.`,
      );
      if (repeatedRecipeCount === 0 && items.length >= dataDays * 2) {
        strengths.push('Các món trong tuần có mức độ đa dạng tốt, không có món nào lặp quá 2 lần.');
      }
    }

    if (dataDays < 3) {
      weaknesses.push(
        'Dữ liệu còn ít, hệ thống chưa thể đánh giá toàn diện xu hướng dinh dưỡng trong tuần.',
      );
    }
    if (incompleteNutritionCount > 0) {
      weaknesses.push(
        `Có ${incompleteNutritionCount} món chưa có đầy đủ thông tin calories, protein, carbs hoặc fat; kết quả phân tích có thể chưa chính xác.`,
      );
    }
    if (!targetCalories) {
      weaknesses.push(
        'Hồ sơ chưa có TDEE nên hệ thống chưa thể so sánh calories với nhu cầu cá nhân.',
      );
    } else if (calorieRatio !== null && calorieRatio < 0.7) {
      weaknesses.push(
        `Calories trung bình đang thấp hơn nhiều so với nhu cầu cá nhân (${averageCalories.toLocaleString('vi-VN')}/${targetCalories.toLocaleString('vi-VN')} kcal/ngày).`,
      );
    } else if (calorieRatio !== null && calorieRatio > 1.15) {
      weaknesses.push(
        `Calories trung bình vượt mục tiêu (${averageCalories.toLocaleString('vi-VN')}/${targetCalories.toLocaleString('vi-VN')} kcal/ngày).`,
      );
    }
    if (fatPercent > 35 && macroCalories > 0) {
      weaknesses.push(
        `Chất béo đang chiếm khoảng ${fatPercent}% năng lượng từ các nhóm chất đã ghi nhận. Đây là dấu hiệu tham khảo, không phải chẩn đoán y khoa.`,
      );
    }

    if (dataDays < 7) {
      recommendations.push(
        `Hãy bổ sung thực đơn cho ${7 - dataDays} ngày còn thiếu để phân tích xu hướng tuần chính xác hơn.`,
      );
    }
    if (!targetCalories) {
      recommendations.push(
        'Cập nhật cân nặng, chiều cao, ngày sinh, giới tính và mức vận động trong hồ sơ để hệ thống tính TDEE.',
      );
    } else if (calorieRatio !== null && calorieRatio < 0.7) {
      recommendations.push(
        'Nên bổ sung thêm món chính hoặc tăng khẩu phần ở các bữa còn thiếu năng lượng.',
      );
    } else if (calorieRatio !== null && calorieRatio > 1.15) {
      recommendations.push(
        'Nên cân nhắc giảm khẩu phần hoặc giảm các món có calories cao trong những ngày vượt mục tiêu.',
      );
    }
    if (proteinPercent > 0 && proteinPercent < 10) {
      recommendations.push(
        `Protein đang đóng góp khoảng ${proteinPercent}% năng lượng từ các nhóm chất đã ghi nhận. Có thể cân nhắc thêm thịt gà, cá, trứng hoặc đậu hũ.`,
      );
    }
    if (fatPercent > 35 || friedCount > 3) {
      recommendations.push(
        'Có thể giảm món chiên xào nhiều dầu và ưu tiên món hấp, luộc hoặc nướng.',
      );
    }

    let storedAnalysis = await this.analysisRepo.findOne({
      where: { userId, weekStart },
    });
    if (!storedAnalysis) {
      storedAnalysis = new WeeklyNutritionAnalysis();
      storedAnalysis.userId = userId;
      storedAnalysis.weekStart = weekStart;
    }

    // Legacy column is retained for database compatibility, but no score is shown to users.
    storedAnalysis.nutritionScore = 0;
    storedAnalysis.strengths = strengths;
    storedAnalysis.weaknesses = weaknesses;
    storedAnalysis.recommendations = recommendations;
    storedAnalysis.macroSummary = {
      totalCalories,
      proteinGrams: Math.round(totalProtein),
      carbsGrams: Math.round(totalCarbs),
      fatGrams: Math.round(totalFat),
      greensCount: 0,
    };

    const saved = await this.analysisRepo.save(storedAnalysis);
    const { nutritionScore: _legacyScore, ...safeAnalysis } = saved;

    return {
      ...safeAnalysis,
      analysis,
      dataDays,
      incompleteNutritionCount,
      targetCalories,
    };
  }

  async getLatestAnalysis(
    userId: string,
  ): Promise<WeeklyNutritionAnalysis | null> {
    return this.analysisRepo.findOne({
      where: { userId },
      order: { weekStart: 'DESC' },
    });
  }

  async getAnalysisByWeek(
    userId: string,
    weekStart: string,
  ): Promise<WeeklyNutritionAnalysis | null> {
    return this.analysisRepo.findOne({ where: { userId, weekStart } });
  }

  private buildOverallAnalysis(params: {
    dataDays: number;
    averageCalories: number;
    targetCalories: number | null;
    calorieRatio: number | null;
  }): string {
    const { dataDays, averageCalories, targetCalories, calorieRatio } = params;
    const dataNote =
      dataDays < 3
        ? 'Dữ liệu tuần hiện tại chưa đầy đủ. Nhận xét chỉ mang tính tham khảo dựa trên các ngày đã có thực đơn. '
        : '';

    if (!targetCalories || calorieRatio === null) {
      return `${dataNote}Đã tổng hợp ${dataDays} ngày có thực đơn với trung bình ${averageCalories.toLocaleString('vi-VN')} kcal/ngày. Hãy cập nhật hồ sơ cơ thể để hệ thống tính TDEE và so sánh với nhu cầu cá nhân.`;
    }
    if (calorieRatio < 0.7) {
      return `${dataNote}Lượng calories trung bình đang thấp hơn nhiều so với nhu cầu cá nhân.`;
    }
    if (calorieRatio <= 1) {
      return `${dataNote}Lượng calories trung bình tương đối phù hợp với mục tiêu.`;
    }
    if (calorieRatio <= 1.15) {
      return `${dataNote}Calories trung bình hơi cao so với mục tiêu.`;
    }
    return `${dataNote}Calories trung bình vượt mục tiêu, nên cân nhắc giảm món nhiều năng lượng.`;
  }

  private toPositiveNumber(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private formatDateInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
