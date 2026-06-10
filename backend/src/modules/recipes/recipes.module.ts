import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecipesController } from './recipes.controller';
import { AdminModerationController } from './admin-moderation.controller';
import { RecipesService } from './recipes.service';
import { RecipeModerationService } from './recipe-moderation.service';
import { RecipeRatingService } from './recipe-rating.service';
import { ReviewModerationService } from './review-moderation.service';
import { Recipe } from './entities/recipe.entity';
import { Ingredient } from './entities/ingredient.entity';
import { RecipeIngredient } from './entities/recipe-ingredient.entity';
import { Favorite } from './entities/favorite.entity';
import { RecipeModerationAudit } from './entities/recipe-moderation-audit.entity';
import { RecipeRating } from './entities/recipe-rating.entity';
import { AdminNotification } from './entities/admin-notification.entity';
import { User } from '../auth/entities/user.entity';
import { RecipeView } from './entities/recipe-view.entity';
import { NotificationModule } from '../notification/notification.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Recipe, Ingredient, RecipeIngredient, Favorite, RecipeModerationAudit, RecipeRating, AdminNotification, User, RecipeView,
        ]),
        NotificationModule,
    ],
    controllers: [RecipesController, AdminModerationController],
    providers: [RecipesService, RecipeModerationService, RecipeRatingService, ReviewModerationService],
    exports: [RecipesService, RecipeModerationService, RecipeRatingService, ReviewModerationService, TypeOrmModule],
})
export class RecipesModule { }
