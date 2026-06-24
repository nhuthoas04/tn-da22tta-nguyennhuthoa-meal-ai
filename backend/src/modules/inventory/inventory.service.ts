import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Inventory } from './entities/inventory.entity';
import { Ingredient } from '../recipes/entities/ingredient.entity';
import { InventoryAllocation } from './entities/inventory-allocation.entity';

type InventoryStatus =
  | 'available'
  | 'near_expiry'
  | 'expired'
  | 'used_up'
  | 'no_expiry';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Inventory) private inventoryRepo: Repository<Inventory>,
    @InjectRepository(Ingredient)
    private ingredientRepo: Repository<Ingredient>,
    @InjectRepository(InventoryAllocation)
    private allocationRepo: Repository<InventoryAllocation>,
  ) {}

  async findAll(userId: string, expiringSoon?: boolean, category?: string) {
    const qb = this.inventoryRepo
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.ingredient', 'ingredient')
      .where('inv.userId = :userId', { userId });

    if (expiringSoon) {
      const today = this.startOfDay(new Date());
      const threeDaysLater = this.addDays(today, 3);
      qb.andWhere('inv.expirationDate IS NOT NULL');
      qb.andWhere('inv.expirationDate >= :today', { today });
      qb.andWhere('inv.expirationDate <= :date', { date: threeDaysLater });
    }

    if (category) {
      qb.andWhere('ingredient.category = :category', { category });
    }

    qb.orderBy('inv.expirationDate', 'ASC', 'NULLS LAST').addOrderBy('inv.addedDate', 'ASC');

    const items = await qb.getMany();
    const inventoryIds = items.map((item) => item.id);

    const allocations =
      inventoryIds.length > 0
        ? await this.allocationRepo.find({
            where: { inventoryItemId: In(inventoryIds) },
            relations: ['mealPlanItem', 'mealPlanItem.recipe', 'shoppingList'],
            order: { allocationDate: 'DESC' },
          })
        : [];

    const allocationsByInventory = new Map<string, InventoryAllocation[]>();
    allocations.forEach((alloc) => {
      const list = allocationsByInventory.get(alloc.inventoryItemId) || [];
      list.push(alloc);
      allocationsByInventory.set(alloc.inventoryItemId, list);
    });

    const data = items.map((item) => this.mapInventoryItem(item, allocationsByInventory.get(item.id) || []));

    const summary = {
      total: data.length,
      available: data.filter((i) => i.status === 'available').length,
      nearExpiry: data.filter((i) => i.status === 'near_expiry').length,
      expired: data.filter((i) => i.status === 'expired').length,
      usedUp: data.filter((i) => i.status === 'used_up').length,
      critical: data.filter((i) => i.status === 'expired').length,
      high: data.filter((i) => i.status === 'near_expiry').length,
      medium: 0,
      low: data.filter((i) => i.status === 'available' || i.status === 'no_expiry').length,
    };

    return { data, summary };
  }

  async create(
    userId: string,
    dto: {
      ingredientId: string;
      quantity: number;
      unit: string;
      purchaseDate?: string;
      expirationDate?: string;
      notes?: string;
    },
  ) {
    if (!dto.ingredientId?.trim()) {
      throw new BadRequestException('Tên nguyên liệu không được trống.');
    }

    const ingredient = await this.ingredientRepo.findOne({
      where: { id: dto.ingredientId },
    });
    if (!ingredient) throw new NotFoundException('Ingredient not found');

    const quantity = Number(dto.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BadRequestException('Số lượng phải lớn hơn 0.');
    }

    if (!dto.unit?.trim()) {
      throw new BadRequestException('Đơn vị không được trống.');
    }

    const purchaseDate = dto.purchaseDate
      ? this.parseDateInput(dto.purchaseDate)
      : this.startOfDay(new Date());
    const expirationDate = dto.expirationDate
      ? this.parseDateInput(dto.expirationDate)
      : null;

    this.validateDates(purchaseDate, expirationDate);

    const item = this.inventoryRepo.create({
      userId,
      ingredientId: dto.ingredientId,
      initialQuantity: quantity,
      quantity,
      unit: dto.unit.trim(),
      purchaseDate,
      expirationDate,
      notes: dto.notes,
    });

    const saved = await this.inventoryRepo.save(item);
    const fullItem = await this.inventoryRepo.findOne({
      where: { id: saved.id },
      relations: ['ingredient'],
    });

    return this.mapInventoryItem(fullItem, []);
  }

  async update(
    userId: string,
    id: string,
    dto: {
      quantity?: number;
      purchaseDate?: string;
      expirationDate?: string;
      notes?: string;
    },
  ) {
    const item = await this.inventoryRepo.findOne({
      where: { id, userId },
      relations: ['ingredient'],
    });
    if (!item) throw new NotFoundException('Inventory item not found');

    if (dto.quantity !== undefined) {
      const nextRemaining = Number(dto.quantity);
      if (!Number.isFinite(nextRemaining) || nextRemaining < 0) {
        throw new BadRequestException('Số lượng còn lại không hợp lệ');
      }
      if (!Number(item.initialQuantity)) {
        item.initialQuantity = Number(item.quantity || 0);
      }
      item.quantity = nextRemaining;
      item.initialQuantity = Math.max(Number(item.initialQuantity), nextRemaining);
    }

    if (dto.purchaseDate !== undefined) {
      item.purchaseDate = dto.purchaseDate
        ? this.parseDateInput(dto.purchaseDate)
        : this.startOfDay(new Date());
    }

    if (dto.expirationDate !== undefined) {
      item.expirationDate = dto.expirationDate
        ? this.parseDateInput(dto.expirationDate)
        : null;
    }

    if (dto.notes !== undefined) {
      item.notes = dto.notes;
    }

    this.validateDates(
      item.purchaseDate ? this.startOfDay(new Date(item.purchaseDate)) : null,
      item.expirationDate ? this.startOfDay(new Date(item.expirationDate)) : null,
    );

    const saved = await this.inventoryRepo.save(item);
    const allocations = await this.allocationRepo.find({
      where: { inventoryItemId: saved.id },
      relations: ['mealPlanItem', 'mealPlanItem.recipe', 'shoppingList'],
      order: { allocationDate: 'DESC' },
    });

    return this.mapInventoryItem(saved, allocations);
  }

  async remove(userId: string, id: string) {
    const item = await this.inventoryRepo.findOne({ where: { id, userId } });
    if (!item) throw new NotFoundException('Inventory item not found');
    await this.inventoryRepo.remove(item);
    return { message: 'Item removed from inventory' };
  }

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

  private mapInventoryItem(item: Inventory, allocations: InventoryAllocation[]) {
    const today = this.startOfDay(new Date());
    const status = this.getStatus(item, today);
    const allocatedTotal = this.roundQuantity(
      allocations.reduce(
        (sum, alloc) => sum + Number(alloc.quantityAllocated || 0),
        0,
      ),
    );
    const persistedInitialQuantity = Number(item.initialQuantity || 0);
    const computedInitialQuantity = this.roundQuantity(
      Number(item.quantity || 0) + allocatedTotal,
    );
    const initialQuantity = this.roundQuantity(
      Math.max(persistedInitialQuantity, computedInitialQuantity),
    );
    const daysLeft = item.expirationDate
      ? this.getDaysLeft(new Date(item.expirationDate), today)
      : null;
    const usedQuantity = this.roundQuantity(
      Math.max(initialQuantity - Number(item.quantity || 0), 0),
    );

    const usageHistory = allocations.map((alloc) => {
      const recipeName =
        alloc.recipeName ||
        alloc.mealPlanItem?.recipe?.name ||
        alloc.usedForMeal ||
        'Món ăn';
      const mealType = alloc.usedForMeal || alloc.mealPlanItem?.mealType || null;
      const mealDate = alloc.usedForDate || alloc.mealPlanItem?.mealDate || null;
      const shoppingListName =
        alloc.shoppingListName || alloc.shoppingList?.name || 'Chưa xác định danh sách';
      const quantityAllocated = this.roundQuantity(Number(alloc.quantityAllocated));
      return {
        id: alloc.id,
        quantityAllocated,
        usedQuantity: quantityAllocated,
        unit: alloc.unit || item.unit,
        reason: alloc.reason || this.buildReasonLabel(alloc),
        ingredientName: alloc.ingredientName || item.ingredient?.name || 'Nguyên liệu',
        recipeName,
        recipeId: alloc.recipeId || alloc.mealPlanItem?.recipeId || null,
        mealType,
        mealTypeLabel: this.getMealTypeLabel(mealType),
        mealDate,
        mealDateLabel: mealDate ? this.formatDateVN(mealDate) : 'Chưa xác định ngày',
        shoppingListId: alloc.shoppingListId || null,
        shoppingListName,
        note:
          alloc.note ||
          `Đã dùng ${quantityAllocated} ${alloc.unit || item.unit} cho ${recipeName}`,
        createdAt: alloc.allocationDate,
        mealPlanId: alloc.mealPlanId || null,
        isActive: alloc.isActive,
        revertedAt: alloc.revertedAt,
      };
    });

    return {
      id: item.id,
      ingredient: {
        id: item.ingredient.id,
        name: item.ingredient.name,
        category: item.ingredient.category,
      },
      quantity: this.roundQuantity(Number(item.quantity || 0)),
      initialQuantity,
      usedQuantity,
      remainingQuantity: this.roundQuantity(Number(item.quantity || 0)),
      allocatedQuantity: usedQuantity,
      availableQuantity: this.roundQuantity(Number(item.quantity || 0)),
      unit: item.unit,
      purchaseDate: item.purchaseDate,
      expirationDate: item.expirationDate,
      status,
      daysLeft,
      urgency: this.mapUrgency(status),
      addedDate: item.addedDate,
      notes: item.notes,
      usageHistory,
      allocations: usageHistory,
    };
  }

  private validateDates(
    purchaseDate: Date | null,
    expirationDate: Date | null,
  ) {
    const today = this.startOfDay(new Date());
    if (purchaseDate && purchaseDate.getTime() > today.getTime()) {
      throw new BadRequestException('Ngày mua không được lớn hơn ngày hiện tại.');
    }
    if (
      purchaseDate &&
      expirationDate &&
      expirationDate.getTime() < purchaseDate.getTime()
    ) {
      throw new BadRequestException('Hạn sử dụng không được nhỏ hơn ngày mua.');
    }
  }

  private getStatus(item: Inventory, today: Date): InventoryStatus {
    const remaining = Number(item.quantity || 0);
    if (remaining <= 0) return 'used_up';
    if (!item.expirationDate) return 'no_expiry';

    const daysLeft = this.getDaysLeft(new Date(item.expirationDate), today);
    if (daysLeft < 0) return 'expired';
    if (daysLeft <= 3) return 'near_expiry';
    return 'available';
  }

  private buildReasonLabel(alloc: InventoryAllocation) {
    if (alloc.shoppingListId) {
      return 'Đã trừ cho danh sách mua sắm';
    }
    if (alloc.mealPlanId) {
      return 'Đã dùng cho thực đơn';
    }
    return alloc.reason || 'Đã sử dụng';
  }

  private getMealTypeLabel(mealType?: string | null) {
    const labels: Record<string, string> = {
      breakfast: 'Bữa sáng',
      lunch: 'Bữa trưa',
      dinner: 'Bữa tối',
    };
    return mealType ? labels[mealType] || 'Chưa xác định bữa' : 'Chưa xác định bữa';
  }

  private formatDateVN(value: Date | string) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return 'Chưa xác định ngày';
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  }

  private mapUrgency(status: InventoryStatus) {
    switch (status) {
      case 'expired':
        return 'critical';
      case 'near_expiry':
        return 'high';
      case 'used_up':
        return 'low';
      default:
        return 'none';
    }
  }

  private getDaysLeft(date: Date, today: Date) {
    const exp = this.startOfDay(date);
    return Math.floor(
      (exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
  }

  private startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private parseDateInput(value: string) {
    const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) {
      throw new BadRequestException('Ngày không hợp lệ.');
    }
    return this.startOfDay(new Date(year, month - 1, day));
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private roundQuantity(value: number) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }
}
