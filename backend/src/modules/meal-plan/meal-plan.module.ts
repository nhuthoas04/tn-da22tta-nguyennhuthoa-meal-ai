import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MealPlanController } from './meal-plan.controller';
import { MealPlanService } from './meal-plan.service';
import { MealPlan } from './entities/meal-plan.entity';
import { MealPlanItem } from './entities/meal-plan-item.entity';
import { Recipe } from '../recipes/entities/recipe.entity';
import { User } from '../auth/entities/user.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import { RecommendationModule } from '../recommendation/recommendation.module';
import { PdfModule } from '../pdf/pdf.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([MealPlan, MealPlanItem, Recipe, User, Inventory]),
        RecommendationModule,
        PdfModule,
    ],
    controllers: [MealPlanController],
    providers: [MealPlanService],
    exports: [MealPlanService],
})
export class MealPlanModule { }
