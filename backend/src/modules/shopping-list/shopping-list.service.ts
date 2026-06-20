import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ShoppingList } from './entities/shopping-list.entity';
import { ShoppingListItem } from './entities/shopping-list-item.entity';
import { MealPlan } from '../meal-plan/entities/meal-plan.entity';
import { MealPlanItem } from '../meal-plan/entities/meal-plan-item.entity';
import { RecipeIngredient } from '../recipes/entities/recipe-ingredient.entity';
import { Recipe } from '../recipes/entities/recipe.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import { User } from '../auth/entities/user.entity';
import { InventoryAllocation } from '../inventory/entities/inventory-allocation.entity';

@Injectable()
export class ShoppingListService {
  constructor(
    @InjectRepository(ShoppingList) private listRepo: Repository<ShoppingList>,
    @InjectRepository(ShoppingListItem)
    private itemRepo: Repository<ShoppingListItem>,
    @InjectRepository(MealPlanItem)
    private mealItemRepo: Repository<MealPlanItem>,
    @InjectRepository(RecipeIngredient)
    private riRepo: Repository<RecipeIngredient>,
    @InjectRepository(Inventory) private inventoryRepo: Repository<Inventory>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(InventoryAllocation)
    private allocationRepo: Repository<InventoryAllocation>,
  ) {}

  /**
   * Get user's shopping lists
   */
  async findAll(userId: string) {
    const lists = await this.listRepo.find({
      where: { userId },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });

    return {
      data: lists.map((list) => ({
        id: list.id,
        name: list.name,
        mealPlanId: list.mealPlanId,
        status: list.status,
        totalItems: list.items.length,
        purchasedItems: list.items.filter((i) => i.isPurchased).length,
        estimatedTotal: 0,
        createdAt: list.createdAt,
      })),
    };
  }

  /**
   * Get shopping list details grouped by category
   */
  async findOne(userId: string, listId: string) {
    const list = await this.listRepo.findOne({
      where: { id: listId, userId },
      relations: ['items', 'items.ingredient'],
    });
    if (!list) throw new NotFoundException('Shopping list not found');

    // Group items by category
    const groups = new Map<string, any[]>();
    for (const item of list.items) {
      const category = item.category || 'Khác';
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push({
        id: item.id,
        ingredient: {
          id: item.ingredient.id,
          name: item.ingredient.name,
        },
        quantity: Number(item.quantity),
        quantityNeeded: Number(item.quantityNeeded),
        quantitySourced: Number(item.quantitySourced),
        unit: item.unit,
        estimatedPrice: item.estimatedPrice,
        isPurchased: item.isPurchased,
      });
    }

    // Get allocations for this list
    const allocations = await this.allocationRepo.find({
      where: { shoppingListId: listId },
      relations: [
        'inventoryItem',
        'inventoryItem.ingredient',
        'mealPlanItem',
        'mealPlanItem.recipe',
      ],
    });

    const mappedAllocations = allocations.map((alloc) => {
      let destination = '';
      if (alloc.usedForMeal && alloc.usedForDate) {
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
        const dateObj = new Date(alloc.usedForDate);
        const dayStr = dayLabels[dateObj.getDay()] || `Thứ ${dateObj.getDay()}`;
        const typeStr = mealTypeVn[alloc.usedForMeal] || alloc.usedForMeal;
        const recipeName = alloc.mealPlanItem?.recipe?.name || 'Món ăn';
        destination = `${recipeName} (${typeStr} - ${dayStr})`;
      } else if (alloc.mealPlanItem && alloc.mealPlanItem.recipe) {
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
        const dateObj = new Date(alloc.mealPlanItem.mealDate);
        const dayStr = dayLabels[dateObj.getDay()] || `Thứ ${dateObj.getDay()}`;
        const typeStr =
          mealTypeVn[alloc.mealPlanItem.mealType] ||
          alloc.mealPlanItem.mealType;
        destination = `${alloc.mealPlanItem.recipe.name} (${typeStr} - ${dayStr})`;
      } else {
        destination = alloc.usedForMeal || 'Món ăn đơn lẻ';
      }

      return {
        id: alloc.id,
        ingredientName: alloc.ingredientName || alloc.inventoryItem?.ingredient?.name || 'Nguyên liệu',
        quantity: Number(alloc.quantityAllocated),
        unit: alloc.unit || alloc.inventoryItem?.unit || '',
        destination,
      };
    });

    return {
      id: list.id,
      name: list.name,
      status: list.status,
      createdAt: list.createdAt,
      estimatedTotal: 0,
      groups: Array.from(groups.entries()).map(([category, items]) => ({
        category,
        items,
      })),
      allocations: mappedAllocations,
    };
  }

  /**
   * Auto-generate shopping list from a meal plan
   *
   * Algorithm:
   * 1. Collect ALL ingredients from ALL meals in the plan
   * 2. Merge duplicates and SUM quantities
   * 3. Subtract what user already has in inventory
   * 4. Group remaining by category
   */
  private readonly DAY_LABELS = {
    1: 'Thứ Hai',
    2: 'Thứ Ba',
    3: 'Thứ Tư',
    4: 'Thứ Năm',
    5: 'Thứ Sáu',
    6: 'Thứ Bảy',
    7: 'Chủ Nhật',
  };

  async generateFromPlan(
    userId: string,
    mealPlanId: string,
    days?: number[],
    mealDates?: string[],
  ) {
    // Get user preferences (to find custom servings)
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['preferences'],
    });
    const userServings = user?.preferences?.servings || 4; // default to 4 if unset

    // Get all meal plan items with their recipes
    const planItems = await this.mealItemRepo.find({
      where: { mealPlanId },
      relations: [
        'recipe',
        'recipe.recipeIngredients',
        'recipe.recipeIngredients.ingredient',
      ],
    });

    const getDayOfWeekIndex = (date: Date | string): number => {
      const d = new Date(date);
      const day = d.getDay();
      return day === 0 ? 7 : day;
    };

    const formatDateInput = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Filter plan items by specific days or dates if provided
    let filteredItems = planItems;
    if (mealDates && mealDates.length > 0) {
      filteredItems = planItems.filter((item) => {
        const dateStr = formatDateInput(new Date(item.mealDate));
        return mealDates.includes(dateStr);
      });
    } else if (days && days.length > 0) {
      filteredItems = planItems.filter((item) =>
        days.includes(getDayOfWeekIndex(item.mealDate)),
      );
    }

    // Step 1: Clean up old pending/in_progress shopping lists and their allocations for this meal plan to avoid double-allocation
    const oldLists = await this.listRepo.find({
      where: {
        mealPlanId,
        status: In(['pending', 'in_progress']),
        userId,
      },
    });
    if (oldLists.length > 0) {
      const oldListIds = oldLists.map((l) => l.id);
      await this.allocationRepo.delete({ shoppingListId: In(oldListIds) });
      await this.listRepo.remove(oldLists);
    }

    // Step 2: Fetch user's inventory to subtract already owned ingredients
    const inventory = await this.inventoryRepo.find({
      where: { userId },
      relations: ['ingredient'],
    });

    // Fetch active allocations for these inventory items
    const inventoryIds = inventory.map((i) => i.id);
    let activeAllocations: InventoryAllocation[] = [];
    if (inventoryIds.length > 0) {
      const allAllocations = await this.allocationRepo.find({
        where: {
          inventoryItemId: In(inventoryIds),
        },
        relations: ['mealPlanItem', 'shoppingList'],
      });
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

    // Keep running track of inventory quantities
    const runningInventory = inventory.map((inv) => {
      const itemAllocations = activeAllocations.filter(
        (a) => a.inventoryItemId === inv.id,
      );
      const allocatedQty = itemAllocations.reduce(
        (sum, a) => sum + Number(a.quantityAllocated),
        0,
      );
      return {
        entity: inv,
        availableQuantity: Math.max(0, Number(inv.quantity) - allocatedQty),
      };
    });

    // Create shopping list first so we have the ID for allocations
    const weekLabel = new Date().toLocaleDateString('vi-VN');
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
    await this.listRepo.save(list);

    const allocationsToSave: Partial<InventoryAllocation>[] = [];
    const mergedNeeded = new Map<
      string,
      {
        ingredientId: string;
        name: string;
        quantityNeeded: number;
        quantitySourced: number;
        unit: string;
        category: string;
        pricePerUnit: number;
      }
    >();

    // Process each meal plan item to allocate ingredients
    for (const planItem of filteredItems) {
      if (!planItem.recipe?.recipeIngredients) continue;

      const recipeServings = planItem.recipe.servings || 4;
      const scale = userServings / recipeServings;

      for (const ri of planItem.recipe.recipeIngredients) {
        if (ri.isOptional) continue;

        const scaledQty = Number(ri.quantity) * scale;
        let remainingNeeded = scaledQty;
        let totalAllocatedForThisRI = 0;

        // Find available inventory items of this ingredient type
        const matchingInvItems = runningInventory.filter(
          (inv) =>
            inv.entity.ingredientId === ri.ingredientId &&
            inv.availableQuantity > 0,
        );

        // Sort by expiration date ascending (nulls last)
        matchingInvItems.sort((a, b) => {
          if (!a.entity.expirationDate) return 1;
          if (!b.entity.expirationDate) return -1;
          return (
            new Date(a.entity.expirationDate).getTime() -
            new Date(b.entity.expirationDate).getTime()
          );
        });

        for (const inv of matchingInvItems) {
          if (remainingNeeded <= 0) break;
          const allocated = Math.min(remainingNeeded, inv.availableQuantity);
          if (allocated > 0) {
            remainingNeeded -= allocated;
            inv.availableQuantity -= allocated;
            totalAllocatedForThisRI += allocated;

            allocationsToSave.push({
              inventoryItemId: inv.entity.id,
              mealPlanId: planItem.mealPlanId,
              mealPlanItemId: planItem.id,
              shoppingListId: list.id,
              quantityAllocated: parseFloat(allocated.toFixed(2)),
              recipeId: planItem.recipeId,
              ingredientName: ri.ingredient.name,
              unit: ri.unit,
              usedForMeal: planItem.mealType,
              usedForDate: planItem.mealDate,
            });
          }
        }

        const key = ri.ingredientId;
        if (mergedNeeded.has(key)) {
          const existing = mergedNeeded.get(key);
          existing.quantityNeeded += scaledQty;
          existing.quantitySourced += totalAllocatedForThisRI;
        } else {
          mergedNeeded.set(key, {
            ingredientId: ri.ingredientId,
            name: ri.ingredient.name,
            quantityNeeded: scaledQty,
            quantitySourced: totalAllocatedForThisRI,
            unit: ri.unit,
            category: this.getCategoryLabel(ri.ingredient.category),
            pricePerUnit: Number(ri.ingredient.averagePrice) || 0,
          });
        }
      }
    }

    // Save allocations to database
    if (allocationsToSave.length > 0) {
      await this.allocationRepo.save(
        allocationsToSave.map((alloc) => this.allocationRepo.create(alloc)),
      );
    }

    // Create shopping list items (including fully sourced ones)
    const listItems = Array.from(mergedNeeded.values()).map((item) => {
      const quantityToBuy = Math.max(
        0,
        item.quantityNeeded - item.quantitySourced,
      );
      const estimatedPrice = 0;

      return this.itemRepo.create({
        shoppingListId: list.id,
        ingredientId: item.ingredientId,
        quantity: parseFloat(quantityToBuy.toFixed(1)),
        quantityNeeded: parseFloat(item.quantityNeeded.toFixed(1)),
        quantitySourced: parseFloat(item.quantitySourced.toFixed(1)),
        unit: item.unit,
        category: item.category,
        estimatedPrice: estimatedPrice,
        isPurchased: quantityToBuy === 0,
      });
    });
    await this.itemRepo.save(listItems);

    return {
      id: list.id,
      name: list.name,
      mealPlanId,
      totalItems: listItems.length,
      estimatedTotal: 0,
      alreadyHave: Array.from(mergedNeeded.values())
        .filter((h) => h.quantitySourced > 0)
        .map((h) => ({
          name: h.name,
          needed: parseFloat(h.quantityNeeded.toFixed(1)),
          have: parseFloat(h.quantitySourced.toFixed(1)),
          unit: h.unit,
        })),
      toBuy: listItems
        .filter((i) => i.quantity > 0)
        .map((i) => {
          const matchingMerged = mergedNeeded.get(i.ingredientId);
          return {
            name: matchingMerged ? matchingMerged.name : 'Nguyên liệu',
            quantity: i.quantity,
            unit: i.unit,
            estimatedPrice: i.estimatedPrice,
          };
        }),
    };
  }

  /**
   * Mark item as purchased
   */
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

    // Calculate progress
    const total = list.items.length;
    const purchased = list.items.filter((i) =>
      i.id === itemId ? isPurchased : i.isPurchased,
    ).length;

    // Auto-update list status
    if (purchased === total) {
      list.status = 'completed';
    } else if (purchased > 0) {
      list.status = 'in_progress';
    }
    await this.listRepo.save(list);

    return {
      id: item.id,
      isPurchased,
      listProgress: {
        total,
        purchased,
        percent: Math.round((purchased / total) * 100 * 10) / 10,
      },
    };
  }

  /**
   * Delete a shopping list
   */
  async remove(userId: string, listId: string) {
    const list = await this.listRepo.findOne({ where: { id: listId, userId } });
    if (!list) throw new NotFoundException('Shopping list not found');
    await this.listRepo.remove(list);
    return { message: 'Shopping list deleted' };
  }

  /**
   * Create a new shopping list from a recipe's ingredients, subtracting inventory and scaling to user preferences
   */
  async addRecipeToList(userId: string, recipeId: string) {
    // 1. Get user servings preferences
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['preferences'],
    });
    const userServings = user?.preferences?.servings || 4;

    // 2. Get recipe details with ingredients
    const recipe = await this.listRepo.manager.getRepository(Recipe).findOne({
      where: { id: recipeId },
      relations: ['recipeIngredients', 'recipeIngredients.ingredient'],
    });
    if (!recipe) throw new NotFoundException('Không tìm thấy món ăn này');

    // 3. Create a shopping list
    const listName = `Mua sắm: ${recipe.name}`;
    const list = this.listRepo.create({
      userId,
      name: listName,
      status: 'pending',
    });
    await this.listRepo.save(list);

    // 4. Scale ingredients and create items
    const recipeServings = recipe.servings || 4;
    const scale = userServings / recipeServings;

    // Get user's inventory to subtract already owned ingredients
    const inventory = await this.inventoryRepo.find({
      where: { userId },
      relations: ['ingredient'],
    });

    // Fetch active allocations for these inventory items
    const inventoryIds = inventory.map((i) => i.id);
    let activeAllocations: InventoryAllocation[] = [];
    if (inventoryIds.length > 0) {
      const allAllocations = await this.allocationRepo.find({
        where: {
          inventoryItemId: In(inventoryIds),
        },
        relations: ['mealPlanItem', 'shoppingList'],
      });
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

    // Keep running track of inventory quantities
    const runningInventory = inventory.map((inv) => {
      const itemAllocations = activeAllocations.filter(
        (a) => a.inventoryItemId === inv.id,
      );
      const allocatedQty = itemAllocations.reduce(
        (sum, a) => sum + Number(a.quantityAllocated),
        0,
      );
      return {
        entity: inv,
        availableQuantity: Math.max(0, Number(inv.quantity) - allocatedQty),
      };
    });

    const allocationsToSave: Partial<InventoryAllocation>[] = [];
    const mergedNeeded = new Map<
      string,
      {
        ingredientId: string;
        name: string;
        quantityNeeded: number;
        quantitySourced: number;
        unit: string;
        category: string;
        pricePerUnit: number;
      }
    >();

    for (const ri of recipe.recipeIngredients) {
      if (ri.isOptional) continue;

      const scaledQty = Number(ri.quantity) * scale;
      let remainingNeeded = scaledQty;
      let totalAllocatedForThisRI = 0;

      // Find available inventory items of this ingredient type
      const matchingInvItems = runningInventory.filter(
        (inv) =>
          inv.entity.ingredientId === ri.ingredientId &&
          inv.availableQuantity > 0,
      );

      // Sort by expiration date ascending (nulls last)
      matchingInvItems.sort((a, b) => {
        if (!a.entity.expirationDate) return 1;
        if (!b.entity.expirationDate) return -1;
        return (
          new Date(a.entity.expirationDate).getTime() -
          new Date(b.entity.expirationDate).getTime()
        );
      });

      for (const inv of matchingInvItems) {
        if (remainingNeeded <= 0) break;
        const allocated = Math.min(remainingNeeded, inv.availableQuantity);
        if (allocated > 0) {
          remainingNeeded -= allocated;
          inv.availableQuantity -= allocated;
          totalAllocatedForThisRI += allocated;

          allocationsToSave.push({
            inventoryItemId: inv.entity.id,
            shoppingListId: list.id,
            quantityAllocated: parseFloat(allocated.toFixed(2)),
            recipeId: recipe.id,
            ingredientName: ri.ingredient.name,
            unit: ri.unit,
            usedForMeal: 'Món ăn đơn lẻ',
            usedForDate: null,
          });
        }
      }

      const key = ri.ingredientId;
      mergedNeeded.set(key, {
        ingredientId: ri.ingredientId,
        name: ri.ingredient.name,
        quantityNeeded: scaledQty,
        quantitySourced: totalAllocatedForThisRI,
        unit: ri.unit,
        category: this.getCategoryLabel(ri.ingredient.category),
        pricePerUnit: Number(ri.ingredient.averagePrice) || 0,
      });
    }

    // Save allocations to database
    if (allocationsToSave.length > 0) {
      await this.allocationRepo.save(
        allocationsToSave.map((alloc) => this.allocationRepo.create(alloc)),
      );
    }

    // Create ShoppingListItems
    const listItems = Array.from(mergedNeeded.values()).map((item) => {
      const quantityToBuy = Math.max(
        0,
        item.quantityNeeded - item.quantitySourced,
      );
      const estimatedPrice = 0;

      return this.itemRepo.create({
        shoppingListId: list.id,
        ingredientId: item.ingredientId,
        quantity: parseFloat(quantityToBuy.toFixed(1)),
        quantityNeeded: parseFloat(item.quantityNeeded.toFixed(1)),
        quantitySourced: parseFloat(item.quantitySourced.toFixed(1)),
        unit: item.unit,
        category: item.category,
        estimatedPrice: estimatedPrice,
        isPurchased: quantityToBuy === 0,
      });
    });

    if (listItems.length > 0) {
      await this.itemRepo.save(listItems);
    }

    return {
      id: list.id,
      name: list.name,
      totalItems: listItems.length,
      estimatedTotal: 0,
    };
  }

  // Vietnamese category labels
  private getCategoryLabel(category: string): string {
    const labels: Record<string, string> = {
      rau_cu: 'Rau củ',
      thit: 'Thịt / Cá',
      hai_san: 'Hải sản',
      gia_vi: 'Gia vị',
      khac: 'Khác',
    };
    return labels[category] || 'Khác';
  }
}
