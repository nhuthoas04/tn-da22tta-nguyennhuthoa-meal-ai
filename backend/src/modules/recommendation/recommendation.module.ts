import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CalorieService } from './calorie.service';
import { RecommendationService } from './recommendation.service';
import { NutritionAnalyzerService } from './nutrition-analyzer.service';
import { RecommendationController } from './recommendation.controller';
import { Recipe } from '../recipes/entities/recipe.entity';
import { RecipeIngredient } from '../recipes/entities/recipe-ingredient.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import { User } from '../auth/entities/user.entity';
import { UserPreference } from '../auth/entities/user-preference.entity';
import { Favorite } from '../recipes/entities/favorite.entity';
import { WeeklyNutritionAnalysis } from './entities/weekly-nutrition-analysis.entity';
import { MealPlan } from '../meal-plan/entities/meal-plan.entity';
import { MealPlanItem } from '../meal-plan/entities/meal-plan-item.entity';
import { UserActionLog } from '../chatbot/entities/user-action-log.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Recipe,
      RecipeIngredient,
      Inventory,
      User,
      UserPreference,
      Favorite,
      WeeklyNutritionAnalysis,
      MealPlan,
      MealPlanItem,
      UserActionLog,
    ]),
    forwardRef(() => AuthModule),
  ],
  controllers: [RecommendationController],
  providers: [CalorieService, RecommendationService, NutritionAnalyzerService],
  exports: [
    CalorieService,
    RecommendationService,
    NutritionAnalyzerService,
    TypeOrmModule,
  ],
})
export class RecommendationModule {}
