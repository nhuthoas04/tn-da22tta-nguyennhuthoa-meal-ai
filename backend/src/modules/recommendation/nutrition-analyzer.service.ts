import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WeeklyNutritionAnalysis } from './entities/weekly-nutrition-analysis.entity';
import { MealPlan } from '../meal-plan/entities/meal-plan.entity';
import { User } from '../auth/entities/user.entity';

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

  async analyzeWeeklyPlan(userId: string, weekStart: string): Promise<WeeklyNutritionAnalysis | null> {
    this.logger.log(`Analyzing weekly nutrition for user: ${userId}, weekStart: ${weekStart}`);
    
    // 1. Fetch user to check calorie target
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return null;
    const dailyCalorieTarget = user.dailyCalorieTarget || 2000;
    const weeklyCalorieTarget = dailyCalorieTarget * 7;

    // 2. Fetch the meal plan with items and recipes
    const parsedDate = new Date(weekStart);
    const mealPlan = await this.mealPlanRepo.findOne({
      where: { userId, weekStart: parsedDate },
      relations: ['items', 'items.recipe'],
    });

    if (!mealPlan || !mealPlan.items || mealPlan.items.length === 0) {
      this.logger.warn(`No meal plan items found to analyze for week: ${weekStart}`);
      return null;
    }

    // 3. Compute macros sum
    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;
    let greensCount = 0;
    let friedCount = 0;
    let redMeatCount = 0;
    const recipeCounts = new Map<string, { name: string; count: number }>();

    for (const item of mealPlan.items) {
      if (!item.recipe) continue;
      const recipe = item.recipe;

      totalCalories += Number(recipe.calories || 0);
      totalProtein += Number(recipe.protein || 0);
      totalCarbs += Number(recipe.carbs || 0);
      totalFat += Number(recipe.fat || 0);

      // Check tags
      const tags = recipe.tags || [];
      const recipeName = recipe.name.toLowerCase();

      // Greens / veggies check
      const hasGreens = tags.some(t => t.toLowerCase() === 'rau' || t.toLowerCase() === 'canh' || t.toLowerCase() === 'chay') ||
                        recipeName.includes('rau') || recipeName.includes('canh');
      if (hasGreens) greensCount++;

      // Fried foods check
      const isFried = tags.some(t => t.toLowerCase() === 'chiên' || t.toLowerCase() === 'rán' || t.toLowerCase() === 'quay') ||
                      recipeName.includes('chiên') || recipeName.includes('rán') || recipeName.includes('quay');
      if (isFried) friedCount++;

      // Red meat check
      const isRedMeat = (recipeName.includes('bò') || recipeName.includes('lợn') || recipeName.includes('heo') || recipeName.includes('ba chỉ')) &&
                        !(recipeName.includes('gà') || recipeName.includes('cá') || recipeName.includes('tôm') || recipeName.includes('hải sản') || recipeName.includes('chay'));
      if (isRedMeat) redMeatCount++;

      // Repeat checks
      const countData = recipeCounts.get(recipe.id) || { name: recipe.name, count: 0 };
      countData.count++;
      recipeCounts.set(recipe.id, countData);
    }

    // 4. Scoring Algorithm & Feedback Construction
    let score = 100;
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const recommendations: string[] = [];

    // Calorie rating
    const calorieDiffPercent = ((totalCalories - weeklyCalorieTarget) / weeklyCalorieTarget) * 100;
    if (Math.abs(calorieDiffPercent) <= 10) {
      strengths.push('Lượng calo tổng thể trong tuần cân bằng, phù hợp mục tiêu năng lượng.');
    } else if (calorieDiffPercent > 10) {
      const deduction = Math.min(Math.round(calorieDiffPercent - 10), 20);
      score -= deduction;
      weaknesses.push(`Lượng calo vượt quá mục tiêu ${Math.round(calorieDiffPercent)}% (${totalCalories} kcal so với mục tiêu ${weeklyCalorieTarget} kcal).`);
      recommendations.push('Cân nhắc thay thế một số món nhiều calo bằng các món luộc, salad, ít dầu mỡ.');
    } else {
      const deduction = Math.min(Math.round(Math.abs(calorieDiffPercent) - 10), 20);
      score -= deduction;
      weaknesses.push(`Lượng calo tuần thấp hơn khuyến nghị ${Math.round(Math.abs(calorieDiffPercent))}% (${totalCalories} kcal so với mục tiêu ${weeklyCalorieTarget} kcal).`);
      recommendations.push('Đảm bảo ăn đầy đủ các bữa chính hoặc tăng khẩu phần ăn để không bị thiếu năng lượng.');
    }

    // Macro balance percentages
    const carbCal = totalCarbs * 4;
    const protCal = totalProtein * 4;
    const fatCal = totalFat * 9;
    const computedTotalCal = carbCal + protCal + fatCal || 1;

    const carbPercent = (carbCal / computedTotalCal) * 100;
    const protPercent = (protCal / computedTotalCal) * 100;
    const fatPercent = (fatCal / computedTotalCal) * 100;

    // Protein check
    if (protPercent >= 15 && protPercent <= 30) {
      strengths.push('Lượng protein đầy đủ và phân bổ hợp lý, tốt cho cơ bắp.');
    } else if (protPercent < 15) {
      score -= 10;
      weaknesses.push(`Tỷ lệ Protein hơi thấp (${Math.round(protPercent)}% so với khuyến nghị 15-30%).`);
      recommendations.push('Bổ sung thêm ức gà, trứng, đậu hũ hoặc thịt bò nạc vào thực đơn.');
    }

    // Carbs check
    if (carbPercent > 65) {
      score -= 10;
      weaknesses.push(`Tỷ lệ Carbohydrate quá cao (${Math.round(carbPercent)}%), có thể gây tích mỡ.`);
      recommendations.push('Giảm bớt tinh bột trắng (cơm, mì) hoặc chuyển sang tinh bột hấp thu chậm (cơm lứt, khoai lang).');
    } else if (carbPercent < 40 && carbPercent > 0) {
      strengths.push('Tỷ lệ Carbohydrate thấp, phù hợp với người muốn giảm cân nhanh.');
    }

    // Fats check
    if (fatPercent > 35) {
      score -= 10;
      weaknesses.push(`Tỷ lệ chất béo quá cao (${Math.round(fatPercent)}% so với khuyến nghị 20-35%).`);
      recommendations.push('Hạn chế các đồ chiên xào nhiều dầu mỡ và thay bằng chất béo tốt (quả bơ, dầu oliu, hạt).');
    }

    // Greens check
    if (greensCount >= 5) {
      strengths.push('Bổ sung rất tốt chất xơ và vitamin nhờ các bữa ăn chứa rau xanh.');
    } else {
      score -= 15;
      weaknesses.push(`Thiếu chất xơ trầm trọng (chỉ có ${greensCount} bữa chứa rau xanh trong tuần).`);
      recommendations.push('Hãy bổ sung tối thiểu 5 bữa chứa rau luộc, xào hoặc canh rau trong thực đơn tuần.');
    }

    // Red meat warn
    if (redMeatCount > 4) {
      score -= 10;
      weaknesses.push(`Sử dụng quá nhiều thịt đỏ (${redMeatCount} bữa thịt heo/bò tuần này).`);
      recommendations.push('Giảm tần suất thịt đỏ, xen kẽ ăn thịt trắng (gà, cá, tôm) ít nhất 3 ngày trong tuần.');
    }

    // Fried foods warn
    if (friedCount > 3) {
      score -= 10;
      weaknesses.push(`Tần suất ăn đồ chiên rán cao (${friedCount} món nhiều dầu mỡ).`);
      recommendations.push('Thay thế các món chiên rán bằng món hấp, luộc hoặc nướng bằng nồi chiên không dầu.');
    }

    // Repeated recipes check
    let repeatedCount = 0;
    for (const [_, data] of recipeCounts) {
      if (data.count > 2) {
        repeatedCount++;
      }
    }
    if (repeatedCount > 0) {
      score -= 10;
      weaknesses.push(`Thực đơn lặp món nhiều (có ${repeatedCount} món bị lặp lại hơn 2 lần trong tuần).`);
      recommendations.push('Đa dạng hóa món ăn để cơ thể hấp thu phong phú vi chất dinh dưỡng.');
    }

    // Adjust score boundaries
    score = Math.max(0, Math.min(100, score));

    // 5. Store / Update in database
    let analysis = await this.analysisRepo.findOne({ where: { userId, weekStart } });
    if (!analysis) {
      analysis = new WeeklyNutritionAnalysis();
      analysis.userId = userId;
      analysis.weekStart = weekStart;
    }

    analysis.nutritionScore = score;
    analysis.strengths = strengths;
    analysis.weaknesses = weaknesses;
    analysis.recommendations = recommendations;
    analysis.macroSummary = {
      totalCalories,
      proteinGrams: Math.round(totalProtein),
      carbsGrams: Math.round(totalCarbs),
      fatGrams: Math.round(totalFat),
      greensCount,
    };

    const savedAnalysis = await this.analysisRepo.save(analysis);
    this.logger.log(`Weekly nutrition report computed and saved with score: ${score}`);
    return savedAnalysis;
  }

  async getLatestAnalysis(userId: string): Promise<WeeklyNutritionAnalysis | null> {
    return await this.analysisRepo.findOne({
      where: { userId },
      order: { weekStart: 'DESC' },
    });
  }

  async getAnalysisByWeek(userId: string, weekStart: string): Promise<WeeklyNutritionAnalysis | null> {
    return await this.analysisRepo.findOne({
      where: { userId, weekStart },
    });
  }
}
