import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatbotController } from './chatbot.controller';
import { ChatbotAIService } from './chatbot-ai.service';
import { ChatbotActionHandler } from './chatbot-action.handler';
import { ChatMessage } from './entities/chat-message.entity';
import { UserActionLog } from './entities/user-action-log.entity';
import { User } from '../auth/entities/user.entity';
import { RecipesModule } from '../recipes/recipes.module';
import { InventoryModule } from '../inventory/inventory.module';
import { MealPlanModule } from '../meal-plan/meal-plan.module';
import { ShoppingListModule } from '../shopping-list/shopping-list.module';
import { RecommendationModule } from '../recommendation/recommendation.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatMessage, User, UserActionLog]),
    RecipesModule,
    InventoryModule,
    MealPlanModule,
    ShoppingListModule,
    RecommendationModule,
    ConfigModule,
  ],
  controllers: [ChatbotController],
  providers: [ChatbotAIService, ChatbotActionHandler],
  exports: [ChatbotAIService, TypeOrmModule],
})
export class ChatbotModule {}
