import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, LessThanOrEqual, In } from 'typeorm';
import { Inventory } from './entities/inventory.entity';
import { Ingredient } from '../recipes/entities/ingredient.entity';
import { InventoryAllocation } from './entities/inventory-allocation.entity';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Inventory) private inventoryRepo: Repository<Inventory>,
    @InjectRepository(Ingredient)
    private ingredientRepo: Repository<Ingredient>,
    @InjectRepository(InventoryAllocation)
    private allocationRepo: Repository<InventoryAllocation>,
  ) {}

  /**
   * Get all inventory items for a user with urgency classification
   */
  async findAll(userId: string, expiringSoon?: boolean, category?: string) {
    const qb = this.inventoryRepo
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.ingredient', 'ingredient')
      .where('inv.userId = :userId', { userId });

    if (expiringSoon) {
      const sevenDaysLater = new Date();
      sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
      qb.andWhere('inv.expirationDate <= :date', { date: sevenDaysLater });
      qb.andWhere('inv.expirationDate >= :today', { today: new Date() });
    }

    if (category) {
      qb.andWhere('ingredient.category = :category', { category });
    }

    qb.orderBy('inv.expirationDate', 'ASC', 'NULLS LAST');

    const items = await qb.getMany();

    // Fetch all active allocations for this user's inventory items
    const inventoryIds = items.map((i) => i.id);
    let activeAllocations: InventoryAllocation[] = [];
    if (inventoryIds.length > 0) {
      const allAllocations = await this.allocationRepo.find({
        where: {
          inventoryItemId: In(inventoryIds),
        },
        relations: ['mealPlanItem', 'mealPlanItem.recipe', 'shoppingList'],
      });

      // Filter active ones:
      // If it has a mealPlanItem, it is active if the meal is not consumed yet.
      // If it only has a shoppingList, it is active if the shopping list is not completed.
      activeAllocations = allAllocations.filter((alloc) => {
        if (alloc.mealPlanItem) {
          return !alloc.mealPlanItem.isConsumed;
        }
        if (alloc.shoppingList) {
          return alloc.shoppingList.status !== 'completed';
        }
        return true;
      });
    }

    // Add urgency classification & allocations to each item
    const data = items.map((item) => {
      const daysLeft = item.expirationDate
        ? this.getDaysLeft(item.expirationDate)
        : null;

      // Filter allocations for this specific inventory item
      const itemAllocations = activeAllocations.filter(
        (alloc) => alloc.inventoryItemId === item.id,
      );

      const allocatedQuantity = itemAllocations.reduce(
        (sum, alloc) => sum + Number(alloc.quantityAllocated),
        0,
      );

      const availableQuantity = Math.max(
        0,
        Number(item.quantity) - allocatedQuantity,
      );

      // Map allocations detail for frontend
      const mappedAllocations = itemAllocations.map((alloc) => {
        let destination = '';
        if (alloc.mealPlanItem && alloc.mealPlanItem.recipe) {
          const mealTypeVn = {
            breakfast: 'Sáng',
            lunch: 'Trưa',
            dinner: 'Tối',
          };
          const dayLabels = {
            0: 'Chủ Nhật',
            1: 'Thứ Hai',
            2: 'Thứ Ba',
            3: 'Thứ Tư',
            4: 'Thứ Năm',
            5: 'Thứ Sáu',
            6: 'Thứ Bảy',
          };
          // Format date
          const dateObj = new Date(alloc.mealPlanItem.mealDate);
          const dayStr =
            dayLabels[dateObj.getDay()] || `Thứ ${dateObj.getDay()}`;
          const typeStr =
            mealTypeVn[alloc.mealPlanItem.mealType] ||
            alloc.mealPlanItem.mealType;
          destination = `${alloc.mealPlanItem.recipe.name} (${typeStr} ${dayStr})`;
        } else if (alloc.shoppingList) {
          destination = `Danh sách mua sắm: ${alloc.shoppingList.name}`;
        } else {
          destination = 'Yêu cầu khác';
        }

        return {
          id: alloc.id,
          quantity: Number(alloc.quantityAllocated),
          destination,
          date: alloc.allocationDate,
        };
      });

      return {
        id: item.id,
        ingredient: {
          id: item.ingredient.id,
          name: item.ingredient.name,
          category: item.ingredient.category,
        },
        quantity: Number(item.quantity),
        allocatedQuantity,
        availableQuantity,
        allocations: mappedAllocations,
        unit: item.unit,
        expirationDate: item.expirationDate,
        daysLeft,
        urgency: daysLeft !== null ? this.getUrgency(daysLeft) : null,
        addedDate: item.addedDate,
        notes: item.notes,
      };
    });

    // Summary counts
    const summary = {
      total: data.length,
      critical: data.filter((i) => i.urgency === 'critical').length,
      high: data.filter((i) => i.urgency === 'high').length,
      medium: data.filter((i) => i.urgency === 'medium').length,
      low: data.filter((i) => i.urgency === 'low').length,
    };

    return { data, summary };
  }

  /**
   * Add ingredient to inventory
   */
  async create(
    userId: string,
    dto: {
      ingredientId: string;
      quantity: number;
      unit: string;
      expirationDate?: string;
      notes?: string;
    },
  ) {
    const ingredient = await this.ingredientRepo.findOne({
      where: { id: dto.ingredientId },
    });
    if (!ingredient) throw new NotFoundException('Ingredient not found');

    const item = this.inventoryRepo.create({
      userId,
      ingredientId: dto.ingredientId,
      quantity: dto.quantity,
      unit: dto.unit,
      expirationDate: dto.expirationDate ? new Date(dto.expirationDate) : null,
      notes: dto.notes,
    });

    const saved = await this.inventoryRepo.save(item);

    const daysLeft = saved.expirationDate
      ? this.getDaysLeft(saved.expirationDate)
      : null;

    return {
      id: saved.id,
      ingredient: { id: ingredient.id, name: ingredient.name },
      quantity: saved.quantity,
      unit: saved.unit,
      expirationDate: saved.expirationDate,
      daysLeft,
      urgency: daysLeft !== null ? this.getUrgency(daysLeft) : null,
    };
  }

  /**
   * Update inventory item
   */
  async update(
    userId: string,
    id: string,
    dto: { quantity?: number; expirationDate?: string },
  ) {
    const item = await this.inventoryRepo.findOne({ where: { id, userId } });
    if (!item) throw new NotFoundException('Inventory item not found');

    if (dto.quantity !== undefined) item.quantity = dto.quantity;
    if (dto.expirationDate) item.expirationDate = new Date(dto.expirationDate);

    const saved = await this.inventoryRepo.save(item);
    const daysLeft = saved.expirationDate
      ? this.getDaysLeft(saved.expirationDate)
      : null;

    return {
      id: saved.id,
      quantity: saved.quantity,
      expirationDate: saved.expirationDate,
      daysLeft,
      urgency: daysLeft !== null ? this.getUrgency(daysLeft) : null,
    };
  }

  /**
   * Remove item from inventory
   */
  async remove(userId: string, id: string) {
    const item = await this.inventoryRepo.findOne({ where: { id, userId } });
    if (!item) throw new NotFoundException('Inventory item not found');
    await this.inventoryRepo.remove(item);
    return { message: 'Item removed from inventory' };
  }

  /**
   * Search ingredient catalog (for autocomplete)
   */
  async searchIngredients(q: string, category?: string) {
    const qb = this.ingredientRepo
      .createQueryBuilder('ing')
      .where('LOWER(ing.name) LIKE LOWER(:q)', { q: `%${q}%` });

    if (category) {
      qb.andWhere('ing.category = :category', { category });
    }

    const data = await qb.limit(10).getMany();

    return {
      data: data.map((i) => ({
        id: i.id,
        name: i.name,
        category: i.category,
        defaultUnit: i.defaultUnit,
      })),
    };
  }

  // --- Helpers ---
  private getDaysLeft(date: Date): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = new Date(date);
    exp.setHours(0, 0, 0, 0);
    return Math.floor(
      (exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
  }

  private getUrgency(daysLeft: number): string {
    if (daysLeft <= 1) return 'critical';
    if (daysLeft <= 3) return 'high';
    if (daysLeft <= 5) return 'medium';
    if (daysLeft <= 7) return 'low';
    return 'none';
  }
}
