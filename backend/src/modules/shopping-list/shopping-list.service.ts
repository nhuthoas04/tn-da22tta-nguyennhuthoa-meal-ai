import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ShoppingList } from './entities/shopping-list.entity';
import { ShoppingListItem } from './entities/shopping-list-item.entity';
import { MealPlanItem } from '../meal-plan/entities/meal-plan-item.entity';
import { Recipe } from '../recipes/entities/recipe.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import { User } from '../auth/entities/user.entity';
import { InventoryAllocation } from '../inventory/entities/inventory-allocation.entity';

type NeedSource = {
  mealPlanItemId?: string;
  recipeId?: string;
  recipeName?: string;
  mealType?: string;
  mealDate?: Date | string | null;
};

type AggregatedNeed = {
  ingredientId: string;
  name: string;
  unit: string;
  category: string;
  requiredQuantity: number;
  pricePerUnit: number;
  sources: NeedSource[];
};

type AllocationCandidate = {
  inventoryId: string;
  ingredientId: string;
  ingredientName: string;
  unit: string;
  remainingQuantity: number;
  expirationDate: Date | null;
  purchaseDate: Date | null;
};

type AllocationResult = {
  inventoryItemId: string;
  quantity: number;
  ingredientName: string;
  unit: string;
  recipeName?: string;
  recipeId?: string;
  mealPlanItemId?: string;
  mealPlanId?: string;
  mealDate?: Date | string | null;
  mealType?: string;
  shoppingListId: string;
  shoppingListName?: string;
  reason: string;
  note: string;
};

const CATEGORY_ORDER = [
  'Thịt / Cá / Hải sản',
  'Rau củ',
  'Tinh bột',
  'Trứng / Sữa',
  'Gia vị',
  'Khác',
] as const;

@Injectable()
export class ShoppingListService {
  constructor(
    @InjectRepository(ShoppingList) private listRepo: Repository<ShoppingList>,
    @InjectRepository(ShoppingListItem)
    private itemRepo: Repository<ShoppingListItem>,
    @InjectRepository(MealPlanItem)
    private mealItemRepo: Repository<MealPlanItem>,
    @InjectRepository(Inventory) private inventoryRepo: Repository<Inventory>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(InventoryAllocation)
    private allocationRepo: Repository<InventoryAllocation>,
  ) {}

  private readonly DAY_LABELS = {
    1: 'Thứ Hai',
    2: 'Thứ Ba',
    3: 'Thứ Tư',
    4: 'Thứ Năm',
    5: 'Thứ Sáu',
    6: 'Thứ Bảy',
    7: 'Chủ Nhật',
  };

  async findAll(userId: string) {
    const lists = await this.listRepo.find({
      where: { userId },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });

    return {
      data: lists.map((list) => {
        const buyItems = list.items.filter(
          (item) => Number(item.needToBuyQuantity ?? item.quantity ?? 0) > 0,
        );
        const purchasedItems = buyItems.filter((i) => i.isPurchased).length;
        return {
          id: list.id,
          name: list.name,
          mealPlanId: list.mealPlanId,
          status: list.status,
          totalItems: buyItems.length,
          purchasedItems,
          inventoryCoveredItems: list.items.filter((i) => i.isEnoughFromInventory).length,
          totalIngredients: list.items.length,
          estimatedTotal: 0,
          createdAt: list.createdAt,
        };
      }),
    };
  }

  async findOne(userId: string, listId: string) {
    const list = await this.listRepo.findOne({
      where: { id: listId, userId },
      relations: ['items', 'items.ingredient'],
    });
    if (!list) throw new NotFoundException('Shopping list not found');

    const allocations = await this.allocationRepo.find({
      where: { shoppingListId: listId },
      relations: [
        'inventoryItem',
        'inventoryItem.ingredient',
        'mealPlanItem',
        'mealPlanItem.recipe',
        'shoppingList',
      ],
      order: { allocationDate: 'ASC' },
    });

    const allocationsByIngredient = new Map<string, any[]>();
    allocations.forEach((alloc) => {
      const ingredientId =
        alloc.inventoryItem?.ingredientId || alloc.inventoryItem?.ingredient?.id;
      if (!ingredientId) return;
      const listForIngredient = allocationsByIngredient.get(ingredientId) || [];
      listForIngredient.push(this.mapAllocationDetail(alloc));
      allocationsByIngredient.set(ingredientId, listForIngredient);
    });

    const mappedItems = list.items.map((item) => {
      const requiredQuantity = this.roundQuantity(
        Number(item.quantityNeeded ?? item.quantity ?? 0),
      );
      const availableQuantity = this.roundQuantity(
        Number(item.availableQuantity ?? item.quantitySourced ?? 0),
      );
      const needToBuyQuantity = this.roundQuantity(
        Number(item.needToBuyQuantity ?? item.quantity ?? 0),
      );
      const allocationsForItem = allocationsByIngredient.get(item.ingredientId) || [];

      return {
        id: item.id,
        ingredient: {
          id: item.ingredient.id,
          name: item.ingredient.name,
          category: item.ingredient.category,
        },
        quantity: needToBuyQuantity,
        requiredQuantity,
        quantityNeeded: requiredQuantity,
        availableQuantity,
        quantitySourced: availableQuantity,
        needToBuyQuantity,
        unit: item.unit,
        category: item.category || this.getCategoryLabel(item.ingredient.category),
        estimatedPrice: item.estimatedPrice,
        isPurchased: item.isPurchased,
        isEnoughFromInventory: item.isEnoughFromInventory,
        note: item.note,
        allocations: allocationsForItem,
      };
    });

    const groups = this.groupItems(mappedItems);
    const toBuyItems = mappedItems.filter((item) => item.needToBuyQuantity > 0);
    const inventoryOnlyItems = mappedItems.filter(
      (item) => item.needToBuyQuantity <= 0 && item.availableQuantity > 0,
    );
    const autoDeducted = mappedItems.filter((item) => item.availableQuantity > 0).length;

    return {
      id: list.id,
      name: list.name,
      status: list.status,
      createdAt: list.createdAt,
      estimatedTotal: 0,
      summary: {
        totalIngredients: mappedItems.length,
        needToBuyItems: toBuyItems.length,
        alreadyInInventoryItems: inventoryOnlyItems.length,
        autoDeductedItems: autoDeducted,
        purchasedItems: toBuyItems.filter((item) => item.isPurchased).length,
      },
      groups,
      purchaseGroups: this.groupItems(toBuyItems),
      inventoryGroups: this.groupItems(inventoryOnlyItems),
      allocations: allocations.map((alloc) => this.mapAllocationDetail(alloc)),
    };
  }

  async generateFromPlan(
    userId: string,
    mealPlanId: string,
    days?: number[],
    mealDates?: string[],
  ) {
    const userServings = await this.getUserServings(userId);
    const planItems = await this.mealItemRepo.find({
      where: { mealPlanId },
      relations: [
        'recipe',
        'recipe.recipeIngredients',
        'recipe.recipeIngredients.ingredient',
      ],
    });

    const filteredItems = this.filterMealPlanItems(planItems, days, mealDates);

    await this.rollbackExistingMealPlanLists(userId, mealPlanId);

    const list = await this.createShoppingList(userId, mealPlanId, days);
    const needs = this.aggregateNeedsFromMeals(filteredItems, userServings);
    await this.fillShoppingListFromNeeds({
      userId,
      list,
      needs,
      sourceType: 'meal_plan',
      listDescription: list.name,
      mealPlanId,
    });

    return this.findOne(userId, list.id);
  }

  async markPurchased(
    userId: string,
    listId: string,
    itemId: string,
    isPurchased: boolean,
  ) {
    const list = await this.listRepo.findOne({
      where: { id: listId, userId },
      relations: ['items'],
    });
    if (!list) throw new NotFoundException('Shopping list not found');

    const item = list.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Item not found');

    item.isPurchased = isPurchased;
    await this.itemRepo.save(item);

    const buyItems = list.items.filter(
      (i) => Number(i.needToBuyQuantity ?? i.quantity ?? 0) > 0,
    );
    const total = buyItems.length;
    const purchased = buyItems.filter((i) =>
      i.id === itemId ? isPurchased : i.isPurchased,
    ).length;

    if (total === 0 || purchased === total) {
      list.status = 'completed';
    } else if (purchased > 0) {
      list.status = 'in_progress';
    } else {
      list.status = 'pending';
    }
    await this.listRepo.save(list);

    return {
      id: item.id,
      isPurchased,
      listProgress: {
        total,
        purchased,
        percent: total > 0 ? Math.round((purchased / total) * 1000) / 10 : 100,
      },
    };
  }

  async remove(userId: string, listId: string) {
    const list = await this.listRepo.findOne({ where: { id: listId, userId } });
    if (!list) throw new NotFoundException('Shopping list not found');

    await this.restoreAllocationsForList(listId);
    await this.listRepo.remove(list);
    return { message: 'Shopping list deleted' };
  }

  async addRecipeToList(userId: string, recipeId: string) {
    const userServings = await this.getUserServings(userId);
    const recipe = await this.listRepo.manager.getRepository(Recipe).findOne({
      where: { id: recipeId },
      relations: ['recipeIngredients', 'recipeIngredients.ingredient'],
    });
    if (!recipe) throw new NotFoundException('Không tìm thấy món ăn này');

    const list = this.listRepo.create({
      userId,
      name: `Mua sắm: ${recipe.name}`,
      status: 'pending',
    });
    await this.listRepo.save(list);

    const recipeServings = recipe.servings || 4;
    const scale = userServings / recipeServings;
    const needs = this.aggregateNeedsFromRecipe(recipe, scale);

    await this.fillShoppingListFromNeeds({
      userId,
      list,
      needs,
      sourceType: 'recipe',
      listDescription: recipe.name,
    });

    return this.findOne(userId, list.id);
  }

  private async fillShoppingListFromNeeds(params: {
    userId: string;
    list: ShoppingList;
    needs: AggregatedNeed[];
    sourceType: 'meal_plan' | 'recipe';
    listDescription: string;
    mealPlanId?: string;
  }) {
    const inventoryCandidates = await this.getAvailableInventoryCandidates(params.userId);
    const allocatedMealPlanItemIds = params.mealPlanId
      ? await this.getActiveAllocatedMealPlanItemIds(params.mealPlanId)
      : new Set<string>();
    const inventoryByIngredient = new Map<string, AllocationCandidate[]>();
    inventoryCandidates.forEach((candidate) => {
      const key = `${candidate.ingredientId}:${candidate.unit}`;
      const list = inventoryByIngredient.get(key) || [];
      list.push(candidate);
      inventoryByIngredient.set(key, list);
    });

    const listItems: ShoppingListItem[] = [];
    const allocationsToSave: InventoryAllocation[] = [];

    for (const need of params.needs) {
      const usableSources = need.sources.filter(
        (source) =>
          !source.mealPlanItemId ||
          !allocatedMealPlanItemIds.has(source.mealPlanItemId),
      );
      if (usableSources.length === 0) continue;

      const needForAllocation = {
        ...need,
        sources: usableSources,
      };
      const key = `${need.ingredientId}:${need.unit}`;
      const matchingInventory = inventoryByIngredient.get(key) || [];
      const appliedAllocations = this.allocateInventoryToNeed(
        matchingInventory,
        needForAllocation,
        params.list.id,
        params.mealPlanId,
        params.sourceType,
        params.listDescription,
      );

      if (appliedAllocations.length > 0) {
        const savedAllocations = await this.persistAllocations(appliedAllocations);
        allocationsToSave.push(...savedAllocations);
      }

      const availableQuantity = this.roundQuantity(
        appliedAllocations.reduce((sum, alloc) => sum + alloc.quantity, 0),
      );
      const needToBuyQuantity = this.roundQuantity(
        Math.max(need.requiredQuantity - availableQuantity, 0),
      );
      const note = this.buildShoppingItemNote(
        need.requiredQuantity,
        availableQuantity,
        needToBuyQuantity,
        need.unit,
      );

      const item = this.itemRepo.create({
        shoppingListId: params.list.id,
        ingredientId: need.ingredientId,
        quantity: needToBuyQuantity,
        quantityNeeded: need.requiredQuantity,
        quantitySourced: availableQuantity,
        availableQuantity,
        needToBuyQuantity,
        unit: need.unit,
        category: need.category,
        estimatedPrice: 0,
        isPurchased: false,
        isEnoughFromInventory: needToBuyQuantity <= 0,
        note,
      });

      listItems.push(item);
    }

    if (listItems.length > 0) {
      const savedItems = await this.itemRepo.save(listItems);
      await this.attachShoppingListItemsToAllocations(savedItems, allocationsToSave);
    }
  }

  private async getActiveAllocatedMealPlanItemIds(mealPlanId: string) {
    const allocations = await this.allocationRepo.find({
      where: { mealPlanId, isActive: true },
      select: ['mealPlanItemId'],
    });
    return new Set(
      allocations
        .map((alloc) => alloc.mealPlanItemId)
        .filter((id): id is string => !!id),
    );
  }

  private async attachShoppingListItemsToAllocations(
    savedItems: ShoppingListItem[],
    allocations: InventoryAllocation[],
  ) {
    if (savedItems.length === 0 || allocations.length === 0) return;

    const itemByIngredient = new Map<string, ShoppingListItem>();
    savedItems.forEach((item) => itemByIngredient.set(item.ingredientId, item));

    const updates = allocations
      .map((alloc) => {
        const item = itemByIngredient.get(alloc.inventoryItem.ingredientId);
        if (!item) return null;
        alloc.shoppingListItemId = item.id;
        return alloc;
      })
      .filter(Boolean) as InventoryAllocation[];

    if (updates.length > 0) {
      await this.allocationRepo.save(updates);
    }
  }

  private async persistAllocations(appliedAllocations: AllocationResult[]) {
    const deduplicatedAllocations = await this.filterAlreadyPersistedAllocations(appliedAllocations);
    if (deduplicatedAllocations.length === 0) return [];

    const inventoryIds = deduplicatedAllocations.map((alloc) => alloc.inventoryItemId);
    const inventoryItems = await this.inventoryRepo.find({
      where: { id: In(inventoryIds) },
      relations: ['ingredient'],
    });
    const inventoryById = new Map(inventoryItems.map((item) => [item.id, item]));

    const savedAllocations: InventoryAllocation[] = [];

    for (const applied of deduplicatedAllocations) {
      const inventoryItem = inventoryById.get(applied.inventoryItemId);
      if (!inventoryItem) continue;

      inventoryItem.quantity = this.roundQuantity(
        Number(inventoryItem.quantity) - applied.quantity,
      );

      const allocation = this.allocationRepo.create({
        inventoryItemId: applied.inventoryItemId,
        mealPlanId: applied.mealPlanId || null,
        mealPlanItemId: applied.mealPlanItemId || null,
        shoppingListId: applied.shoppingListId,
        quantityAllocated: applied.quantity,
        recipeId: applied.recipeId || null,
        recipeName: applied.recipeName || null,
        ingredientName: applied.ingredientName,
        shoppingListName: applied.shoppingListName || null,
        unit: applied.unit,
        usedForMeal: applied.mealType || null,
        usedForDate: applied.mealDate ? new Date(applied.mealDate) : null,
        usageType: 'shopping_list',
        reason: applied.reason,
        note: applied.note,
        isActive: true,
      });

      const savedAllocation = await this.allocationRepo.save(allocation);
      savedAllocation.inventoryItem = inventoryItem;
      savedAllocations.push(savedAllocation);
    }

    if (inventoryItems.length > 0) {
      await this.inventoryRepo.save(inventoryItems);
    }

    return savedAllocations;
  }

  private allocateInventoryToNeed(
    inventoryItems: AllocationCandidate[],
    need: AggregatedNeed,
    shoppingListId: string,
    mealPlanId: string | undefined,
    sourceType: 'meal_plan' | 'recipe',
    listDescription: string,
  ) {
    let remainingNeed = need.requiredQuantity;
    const allocations: AllocationResult[] = [];

    for (const source of need.sources) {
      if (remainingNeed <= 0) break;

      for (const inventoryItem of inventoryItems) {
        if (remainingNeed <= 0) break;
        if (inventoryItem.remainingQuantity <= 0) continue;

        const allocated = Math.min(remainingNeed, inventoryItem.remainingQuantity);
        if (allocated <= 0) continue;

        inventoryItem.remainingQuantity = this.roundQuantity(
          inventoryItem.remainingQuantity - allocated,
        );
        remainingNeed = this.roundQuantity(remainingNeed - allocated);

        const reason =
          sourceType === 'meal_plan'
            ? `Đã tự động trừ ${this.roundQuantity(allocated)} ${need.unit} từ tủ lạnh cho danh sách mua sắm`
            : `Đã tự động trừ ${this.roundQuantity(allocated)} ${need.unit} từ tủ lạnh cho món ${listDescription}`;

        const note =
          source.recipeName && source.mealDate
            ? `Dùng ${this.roundQuantity(allocated)} ${need.unit} cho món ${source.recipeName} ngày ${this.formatDate(source.mealDate)}`
            : reason;

        allocations.push({
          inventoryItemId: inventoryItem.inventoryId,
          quantity: this.roundQuantity(allocated),
          ingredientName: need.name,
          unit: need.unit,
          recipeName: source.recipeName,
          recipeId: source.recipeId,
          mealPlanItemId: source.mealPlanItemId,
          mealPlanId,
          mealDate: source.mealDate,
          mealType: source.mealType,
          shoppingListId,
          shoppingListName: listDescription,
          reason,
          note,
        });
      }
    }

    return allocations;
  }

  private async filterAlreadyPersistedAllocations(appliedAllocations: AllocationResult[]) {
    if (appliedAllocations.length === 0) return [];

    const shoppingListIds = Array.from(new Set(appliedAllocations.map((alloc) => alloc.shoppingListId)));
    const existing = await this.allocationRepo.find({
      where: { shoppingListId: In(shoppingListIds), isActive: true },
    });
    const existingKeys = new Set(
      existing.map((alloc) =>
        this.buildAllocationKey({
          inventoryItemId: alloc.inventoryItemId,
          shoppingListId: alloc.shoppingListId,
          mealPlanItemId: alloc.mealPlanItemId || undefined,
          recipeId: alloc.recipeId || undefined,
        }),
      ),
    );

    return appliedAllocations.filter((alloc) => {
      const key = this.buildAllocationKey(alloc);
      if (existingKeys.has(key)) return false;
      existingKeys.add(key);
      return true;
    });
  }

  private buildAllocationKey(input: {
    inventoryItemId: string;
    shoppingListId: string;
    mealPlanItemId?: string;
    recipeId?: string;
  }) {
    return [
      input.shoppingListId,
      input.inventoryItemId,
      input.mealPlanItemId || 'no-meal-item',
      input.recipeId || 'no-recipe',
    ].join(':');
  }

  private async rollbackExistingMealPlanLists(userId: string, mealPlanId: string) {
    const oldLists = await this.listRepo.find({
      where: {
        mealPlanId,
        status: In(['pending', 'in_progress']),
        userId,
      },
    });

    if (oldLists.length === 0) return;

    for (const oldList of oldLists) {
      await this.restoreAllocationsForList(oldList.id);
      await this.listRepo.remove(oldList);
    }
  }

  private async restoreAllocationsForList(shoppingListId: string) {
    const allocations = await this.allocationRepo.find({
      where: { shoppingListId, isActive: true },
      relations: ['inventoryItem'],
      order: { allocationDate: 'DESC' },
    });

    if (allocations.length === 0) return;

    const inventoryById = new Map<string, Inventory>();
    allocations.forEach((alloc) => {
      if (!alloc.inventoryItem) return;
      inventoryById.set(alloc.inventoryItemId, alloc.inventoryItem);
    });

    allocations.forEach((alloc) => {
      const inventoryItem = inventoryById.get(alloc.inventoryItemId);
      if (!inventoryItem) return;
      inventoryItem.quantity = this.roundQuantity(
        Number(inventoryItem.quantity) + Number(alloc.quantityAllocated),
      );
      alloc.isActive = false;
      alloc.revertedAt = new Date();
    });

    await this.inventoryRepo.save(Array.from(inventoryById.values()));
    await this.allocationRepo.save(allocations);
  }

  private async createShoppingList(
    userId: string,
    mealPlanId: string | null,
    days?: number[],
  ) {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const dateLabel = now.toLocaleDateString('vi-VN');
    const weekLabel = `${dateLabel} lúc ${hours}:${minutes}`;
    let listName = `Danh sách mua sắm - ${weekLabel}`;
    if (days && days.length > 0) {
      const dayNames = days
        .map((d) => this.DAY_LABELS[d] || `Thứ ${d}`)
        .join(', ');
      listName = `Đi chợ (${dayNames}) - ${weekLabel}`;
    }

    const list = this.listRepo.create({
      userId,
      mealPlanId,
      name: listName,
      status: 'pending',
    });

    return this.listRepo.save(list);
  }

  private filterMealPlanItems(
    planItems: MealPlanItem[],
    days?: number[],
    mealDates?: string[],
  ) {
    if (mealDates && mealDates.length > 0) {
      return planItems.filter((item) =>
        mealDates.includes(this.formatDate(item.mealDate)),
      );
    }

    if (days && days.length > 0) {
      return planItems.filter((item) => days.includes(this.getDayOfWeekIndex(item.mealDate)));
    }

    return planItems;
  }

  private aggregateNeedsFromMeals(planItems: MealPlanItem[], userServings: number) {
    const aggregated = new Map<string, AggregatedNeed>();

    for (const planItem of planItems) {
      if (!planItem.recipe?.recipeIngredients) continue;

      const recipeServings = planItem.recipe.servings || 4;
      const scale = userServings / recipeServings;

      for (const ri of planItem.recipe.recipeIngredients) {
        if (ri.isOptional) continue;
        const key = `${ri.ingredientId}:${ri.unit}`;
        const required = this.roundQuantity(Number(ri.quantity) * scale);
        const existing = aggregated.get(key);
        const source: NeedSource = {
          mealPlanItemId: planItem.id,
          recipeId: planItem.recipeId,
          recipeName: planItem.recipe.name,
          mealType: planItem.mealType,
          mealDate: planItem.mealDate,
        };

        if (existing) {
          existing.requiredQuantity = this.roundQuantity(
            existing.requiredQuantity + required,
          );
          existing.sources.push(source);
        } else {
          aggregated.set(key, {
            ingredientId: ri.ingredientId,
            name: ri.ingredient.name,
            unit: ri.unit,
            category: this.getCategoryLabel(ri.ingredient.category),
            requiredQuantity: required,
            pricePerUnit: Number(ri.ingredient.averagePrice) || 0,
            sources: [source],
          });
        }
      }
    }

    return Array.from(aggregated.values());
  }

  private aggregateNeedsFromRecipe(recipe: Recipe, scale: number) {
    const aggregated = new Map<string, AggregatedNeed>();

    for (const ri of recipe.recipeIngredients) {
      if (ri.isOptional) continue;
      const key = `${ri.ingredientId}:${ri.unit}`;
      const required = this.roundQuantity(Number(ri.quantity) * scale);
      aggregated.set(key, {
        ingredientId: ri.ingredientId,
        name: ri.ingredient.name,
        unit: ri.unit,
        category: this.getCategoryLabel(ri.ingredient.category),
        requiredQuantity: required,
        pricePerUnit: Number(ri.ingredient.averagePrice) || 0,
        sources: [
          {
            recipeId: recipe.id,
            recipeName: recipe.name,
          },
        ],
      });
    }

    return Array.from(aggregated.values());
  }

  private async getAvailableInventoryCandidates(userId: string) {
    const inventory = await this.inventoryRepo.find({
      where: { userId },
      relations: ['ingredient'],
      order: { expirationDate: 'ASC', purchaseDate: 'ASC', addedDate: 'ASC' },
    });

    const today = this.startOfDay(new Date());

    return inventory
      .filter((item) => Number(item.quantity) > 0)
      .filter((item) => this.isInventoryUsableForShopping(item, today))
      .map((item) => ({
        inventoryId: item.id,
        ingredientId: item.ingredientId,
        ingredientName: item.ingredient.name,
        unit: item.unit,
        remainingQuantity: this.roundQuantity(Number(item.quantity)),
        expirationDate: item.expirationDate ? new Date(item.expirationDate) : null,
        purchaseDate: item.purchaseDate ? new Date(item.purchaseDate) : null,
      }))
      .sort((a, b) => this.compareInventoryCandidates(a, b));
  }

  private isInventoryUsableForShopping(item: Inventory, today: Date) {
    if (Number(item.quantity) <= 0) return false;
    if (!item.expirationDate) return true;
    return this.startOfDay(new Date(item.expirationDate)).getTime() >= today.getTime();
  }

  private compareInventoryCandidates(a: AllocationCandidate, b: AllocationCandidate) {
    if (a.expirationDate && b.expirationDate) {
      return a.expirationDate.getTime() - b.expirationDate.getTime();
    }
    if (a.expirationDate) return -1;
    if (b.expirationDate) return 1;
    if (a.purchaseDate && b.purchaseDate) {
      return a.purchaseDate.getTime() - b.purchaseDate.getTime();
    }
    return 0;
  }

  private async getUserServings(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['preferences'],
    });
    const servings = Number(user?.preferences?.servings);
    if (!Number.isInteger(servings) || servings < 1 || servings > 20) {
      throw new BadRequestException(
        'Vui lòng nhập số người ăn trong hồ sơ cá nhân trước khi tạo danh sách mua sắm.',
      );
    }
    return servings;
  }

  private groupItems(items: any[]) {
    const byCategory = new Map<string, any[]>();

    items.forEach((item) => {
      const category = item.category || 'Khác';
      const group = byCategory.get(category) || [];
      group.push(item);
      byCategory.set(category, group);
    });

    return Array.from(byCategory.entries())
      .sort(
        ([a], [b]) =>
          this.getCategoryOrder(a) - this.getCategoryOrder(b) || a.localeCompare(b, 'vi'),
      )
      .map(([category, groupedItems]) => ({
        category,
        items: groupedItems.sort((a, b) =>
          a.ingredient.name.localeCompare(b.ingredient.name, 'vi'),
        ),
      }));
  }

  private mapAllocationDetail(alloc: InventoryAllocation) {
    const recipeName =
      alloc.recipeName ||
      alloc.mealPlanItem?.recipe?.name ||
      alloc.usedForMeal ||
      'Món ăn';
    const mealType = alloc.usedForMeal || alloc.mealPlanItem?.mealType || null;
    const mealDate = alloc.usedForDate || alloc.mealPlanItem?.mealDate || null;
    const destination =
      alloc.mealPlanItem && alloc.mealPlanItem.recipe
        ? `${alloc.mealPlanItem.recipe.name} - ${this.getMealTypeLabel(
            alloc.mealPlanItem.mealType,
          )} ${this.getDayLabel(alloc.mealPlanItem.mealDate)}`
        : recipeName;

    return {
      id: alloc.id,
      ingredientId:
        alloc.inventoryItem?.ingredientId || alloc.inventoryItem?.ingredient?.id,
      ingredientName:
        alloc.ingredientName || alloc.inventoryItem?.ingredient?.name || 'Nguyên liệu',
      quantity: this.roundQuantity(Number(alloc.quantityAllocated)),
      unit: alloc.unit || alloc.inventoryItem?.unit || '',
      recipeId: alloc.recipeId || alloc.mealPlanItem?.recipeId || null,
      recipeName,
      mealType,
      mealTypeLabel: this.getMealTypeLabel(mealType) || 'Chưa xác định bữa',
      destination,
      note: alloc.note,
      reason: alloc.reason,
      date: alloc.allocationDate,
      mealDate,
      shoppingListId: alloc.shoppingListId || null,
      shoppingListName: alloc.shoppingListName || alloc.shoppingList?.name || 'Chưa xác định danh sách',
      isActive: alloc.isActive,
    };
  }

  private buildShoppingItemNote(
    requiredQuantity: number,
    availableQuantity: number,
    needToBuyQuantity: number,
    unit: string,
  ) {
    if (availableQuantity <= 0) {
      return 'Chưa có trong tủ lạnh.';
    }
    if (needToBuyQuantity <= 0) {
      return 'Đã đủ nguyên liệu, không cần mua.';
    }
    return `Đã tự động trừ ${this.roundQuantity(availableQuantity)} ${unit} từ tủ lạnh.`;
  }

  private getCategoryLabel(category: string): string {
    const labels: Record<string, string> = {
      thit: 'Thịt / Cá / Hải sản',
      hai_san: 'Thịt / Cá / Hải sản',
      rau_cu: 'Rau củ',
      tinh_bot: 'Tinh bột',
      trung_sua: 'Trứng / Sữa',
      gia_vi: 'Gia vị',
      khac: 'Khác',
    };
    return labels[category] || 'Khác';
  }

  private getCategoryOrder(category: string) {
    const index = CATEGORY_ORDER.indexOf(category as (typeof CATEGORY_ORDER)[number]);
    return index === -1 ? CATEGORY_ORDER.length : index;
  }

  private getMealTypeLabel(mealType?: string) {
    const labels: Record<string, string> = {
      breakfast: 'Sáng',
      lunch: 'Trưa',
      dinner: 'Tối',
    };
    return mealType ? labels[mealType] || mealType : '';
  }

  private getDayLabel(date: Date | string) {
    const day = this.getDayOfWeekIndex(date);
    return this.DAY_LABELS[day] || '';
  }

  private getDayOfWeekIndex(date: Date | string) {
    const d = new Date(date);
    const day = d.getDay();
    return day === 0 ? 7 : day;
  }

  private formatDate(date: Date | string) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${day}/${month}/${year}`;
  }

  private startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private roundQuantity(value: number) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }
}
