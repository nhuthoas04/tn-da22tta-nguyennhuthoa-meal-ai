import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { Inventory } from './entities/inventory.entity';
import { Ingredient } from '../recipes/entities/ingredient.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Inventory, Ingredient])],
    controllers: [InventoryController],
    providers: [InventoryService],
    exports: [InventoryService, TypeOrmModule],
})
export class InventoryModule { }
