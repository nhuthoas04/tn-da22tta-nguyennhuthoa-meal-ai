import {
    Controller, Get, Post, Put, Patch, Delete,
    Param, Query, Body, UseGuards, Request, Res, NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MealPlanService } from './meal-plan.service';
import { PdfGeneratorService } from '../pdf/pdf-generator.service';

@Controller('meal-plans')
@UseGuards(AuthGuard('jwt'))
export class MealPlanController {
    constructor(
        private mealPlanService: MealPlanService,
        private pdfGeneratorService: PdfGeneratorService,
    ) { }

    @Get('current/pdf')
    async exportCurrentPdf(@Request() req, @Res() res: any) {
        const plan = await this.mealPlanService.findByWeek(req.user.id);
        if (!plan) {
            throw new NotFoundException('Không tìm thấy thực đơn tuần này');
        }
        const buffer = await this.pdfGeneratorService.generateMealPlanPdf(plan);
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="thuc_don_tuan.pdf"',
            'Content-Length': buffer.length,
        });
        res.end(buffer);
    }

    @Get(':id/pdf')
    async exportPdf(@Request() req, @Param('id') id: string, @Res() res: any) {
        let plan;
        if (id === 'current') {
            plan = await this.mealPlanService.findByWeek(req.user.id);
        } else {
            plan = await this.mealPlanService.findById(req.user.id, id);
        }

        if (!plan) {
            throw new NotFoundException('Không tìm thấy thực đơn để xuất PDF');
        }

        const buffer = await this.pdfGeneratorService.generateMealPlanPdf(plan);
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="thuc_don_${id}.pdf"`,
            'Content-Length': buffer.length,
        });
        res.end(buffer);
    }


    @Get()
    findByWeek(@Request() req, @Query('weekStart') weekStart?: string) {
        return this.mealPlanService.findByWeek(req.user.id, weekStart);
    }

    @Put('slot')
    setMealSlot(
        @Request() req,
        @Body() dto: {
            mealDate?: string;
            weekStart?: string;
            dayOfWeek?: number;
            mealType: string;
            recipeId: string;
            overwrite?: boolean;
        },
    ) {
        let mealDate = dto.mealDate;
        if (!mealDate && dto.weekStart && dto.dayOfWeek) {
            const d = new Date(dto.weekStart);
            d.setDate(d.getDate() + (Number(dto.dayOfWeek) - 1));
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            mealDate = `${year}-${month}-${day}`;
        }
        return this.mealPlanService.setMealSlot(
            req.user.id,
            mealDate,
            dto.mealType,
            dto.recipeId,
            dto.overwrite,
        );
    }

    @Post('generate')
    generate(
        @Request() req,
        @Body() dto: {
            weekStart: string;
            useAntiWaste?: boolean;
            lockedItems?: { dayOfWeek?: number; mealDate?: string; mealType: string; recipeId: string }[];
            emptyPlan?: boolean;
            overwrite?: boolean;
        },
    ) {
        return this.mealPlanService.generate(req.user.id, dto);
    }

    @Post('generate-days')
    generateForDays(
        @Request() req,
        @Body() dto: {
            weekStart?: string;
            days?: number[];
            mealDates?: string[];
            useAntiWaste?: boolean;
            mealType?: string;
            overwrite?: boolean;
        },
    ) {
        return this.mealPlanService.generateForDays(req.user.id, dto);
    }

    @Put(':id/items/:itemId')
    swapRecipe(
        @Request() req,
        @Param('id') id: string,
        @Param('itemId') itemId: string,
        @Body('recipeId') recipeId: string,
    ) {
        return this.mealPlanService.swapRecipe(req.user.id, id, itemId, recipeId);
    }

    @Delete(':id/items/:itemId')
    removeItem(
        @Request() req,
        @Param('id') planId: string,
        @Param('itemId') itemId: string,
    ) {
        return this.mealPlanService.removeItem(req.user.id, planId, itemId);
    }

    @Patch(':id/items/:itemId/lock')
    toggleLock(
        @Request() req,
        @Param('id') id: string,
        @Param('itemId') itemId: string,
        @Body('isLocked') isLocked: boolean,
    ) {
        return this.mealPlanService.toggleLock(req.user.id, id, itemId, isLocked);
    }

    @Patch(':id/items/:itemId/consume')
    toggleConsume(
        @Request() req,
        @Param('id') id: string,
        @Param('itemId') itemId: string,
        @Body('isConsumed') isConsumed: boolean,
    ) {
        return this.mealPlanService.toggleConsume(req.user.id, id, itemId, isConsumed);
    }

    @Delete(':id')
    remove(@Request() req, @Param('id') id: string) {
        return this.mealPlanService.remove(req.user.id, id);
    }

    @Get(':id/nutrition')
    getNutrition(@Request() req, @Param('id') id: string) {
        return this.mealPlanService.getNutrition(req.user.id, id);
    }
}
