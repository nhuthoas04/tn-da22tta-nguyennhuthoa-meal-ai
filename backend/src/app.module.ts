import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AuthModule } from './modules/auth/auth.module';
import { RecipesModule } from './modules/recipes/recipes.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { RecommendationModule } from './modules/recommendation/recommendation.module';
import { MealPlanModule } from './modules/meal-plan/meal-plan.module';
import { ShoppingListModule } from './modules/shopping-list/shopping-list.module';
import { SeedModule } from './modules/seed/seed.module';
import { UploadModule } from './modules/upload/upload.module';
import { ChatbotModule } from './modules/chatbot/chatbot.module';
import { NotificationModule } from './modules/notification/notification.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    // Load .env file
    ConfigModule.forRoot({ isGlobal: true }),

    // PostgreSQL connection via TypeORM
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => {
        const commonConfig: TypeOrmModuleOptions = {
          type: 'postgres' as const,
          autoLoadEntities: true,
          synchronize: config.get<string>('DB_SYNC', 'true') === 'true',
          ssl:
            config.get<string>('DB_SSL', 'false') === 'true'
              ? { rejectUnauthorized: false }
              : false,
          logging: false,
        };
        const databaseUrl = config.get<string>('DATABASE_URL');

        if (databaseUrl) {
          return {
            ...commonConfig,
            url: databaseUrl,
          };
        }

        return {
          ...commonConfig,
          host: config.get<string>('DB_HOST', 'localhost'),
          port: config.get<number>('DB_PORT', 5432),
          username: config.get<string>('DB_USERNAME', 'postgres'),
          password: config.get<string>('DB_PASSWORD', 'postgres'),
          database: config.get<string>('DB_NAME', 'recipe_ai'),
        };
      },
    }),

    // Feature modules
    AuthModule,
    RecipesModule,
    InventoryModule,
    RecommendationModule,
    MealPlanModule,
    ShoppingListModule,
    SeedModule,
    UploadModule,
    ChatbotModule,
    NotificationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
