import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ShoppingListService } from './shopping-list.service';
import { PdfGeneratorService } from '../pdf/pdf-generator.service';

@Controller('shopping-lists')
@UseGuards(AuthGuard('jwt'))
export class ShoppingListController {
  constructor(
    private shoppingListService: ShoppingListService,
    private pdfGeneratorService: PdfGeneratorService,
  ) {}

  @Get(':id/pdf')
  async exportPdf(@Request() req, @Param('id') id: string, @Res() res: any) {
    const list = await this.shoppingListService.findOne(req.user.id, id);
    if (!list) {
      throw new NotFoundException('Không tìm thấy danh sách mua sắm');
    }

    const buffer = await this.pdfGeneratorService.generateShoppingListPdf(list);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="danh_sach_mua_sam_${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get()
  findAll(@Request() req) {
    return this.shoppingListService.findAll(req.user.id);
  }

  @Get(':id')
  findOne(@Request() req, @Param('id') id: string) {
    return this.shoppingListService.findOne(req.user.id, id);
  }

  @Post('generate')
  generate(
    @Request() req,
    @Body() dto: { mealPlanId: string; days?: number[]; mealDates?: string[] },
  ) {
    return this.shoppingListService.generateFromPlan(
      req.user.id,
      dto.mealPlanId,
      dto.days,
      dto.mealDates,
    );
  }

  @Post('add-recipe')
  addRecipe(@Request() req, @Body() dto: { recipeId: string }) {
    return this.shoppingListService.addRecipeToList(req.user.id, dto.recipeId);
  }

  @Patch(':id/items/:itemId')
  markPurchased(
    @Request() req,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body('isPurchased') isPurchased: boolean,
  ) {
    return this.shoppingListService.markPurchased(
      req.user.id,
      id,
      itemId,
      isPurchased,
    );
  }

  @Delete(':id')
  remove(@Request() req, @Param('id') id: string) {
    return this.shoppingListService.remove(req.user.id, id);
  }
}
