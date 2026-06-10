import {
    Controller, Get, Query, UseGuards, Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RecommendationService } from './recommendation.service';
import { NutritionAnalyzerService } from './nutrition-analyzer.service';

@Controller('recommendations')
@UseGuards(AuthGuard('jwt'))
export class RecommendationController {
    constructor(
        private readonly recommendationService: RecommendationService,
        private readonly nutritionAnalyzer: NutritionAnalyzerService,
    ) { }

    /**
     * GET /recommendations?mealType=lunch&limit=5&antiWaste=true
     * Returns AI-scored recipe recommendations
     */
    @Get()
    getRecommendations(
        @Request() req,
        @Query('mealType') mealType: string = 'lunch',
        @Query('limit') limit: number = 5,
        @Query('antiWaste') antiWaste: string = 'true',
        @Query('excludeIds') excludeIds?: string,
    ) {
        const excludeList = excludeIds ? excludeIds.split(',').filter(Boolean) : [];
        return this.recommendationService.getRecommendations(
            req.user.id,
            mealType,
            limit,
            antiWaste === 'true',
            excludeList,
        );
    }

    /**
     * GET /recommendations/anti-waste
     * Returns recipes optimized for reducing food waste
     */
    @Get('anti-waste')
    getAntiWaste(@Request() req) {
        return this.recommendationService.getAntiWasteSuggestions(req.user.id);
    }

    /**
     * GET /recommendations/nutrition-analysis
     * Computes and returns weekly nutritional score/analysis
     */
    @Get('nutrition-analysis')
    getNutritionAnalysis(
        @Request() req,
        @Query('weekStart') weekStart: string,
    ) {
        return this.nutritionAnalyzer.analyzeWeeklyPlan(req.user.id, weekStart);
    }

    /**
     * GET /recommendations/nutrition-analysis/latest
     * Returns the latest calculated nutritional analysis
     */
    @Get('nutrition-analysis/latest')
    getLatestNutritionAnalysis(@Request() req) {
        return this.nutritionAnalyzer.getLatestAnalysis(req.user.id);
    }
}
