import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(AuthGuard('jwt'))
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @Get()
  findAll(
    @Request() req,
    @Query('expiringSoon') expiringSoon?: boolean,
    @Query('category') category?: string,
  ) {
    return this.inventoryService.findAll(req.user.id, expiringSoon, category);
  }

  @Post()
  create(
    @Request() req,
    @Body()
    dto: {
      ingredientId: string;
      quantity: number;
      unit: string;
      purchaseDate?: string;
      expirationDate?: string;
      notes?: string;
    },
  ) {
    return this.inventoryService.create(req.user.id, dto);
  }

  @Put(':id')
  update(
    @Request() req,
    @Param('id') id: string,
    @Body()
    dto: {
      quantity?: number;
      purchaseDate?: string;
      expirationDate?: string;
      notes?: string;
    },
  ) {
    return this.inventoryService.update(req.user.id, id, dto);
  }

  @Delete(':id')
  remove(@Request() req, @Param('id') id: string) {
    return this.inventoryService.remove(req.user.id, id);
  }

  @Get('ingredients/search')
  searchIngredients(
    @Query('q') q: string,
    @Query('category') category?: string,
  ) {
    return this.inventoryService.searchIngredients(q || '', category);
  }
}
