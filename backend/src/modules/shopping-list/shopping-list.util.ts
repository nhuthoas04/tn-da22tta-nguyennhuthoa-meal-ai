export type ShoppingNeed = {
  ingredientId: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  pricePerUnit: number;
};

export type InventoryAvailability = {
  ingredientId: string;
  quantity: number;
  unit?: string;
  expirationDate?: Date | string | null;
};

export type ShoppingDiffItem = ShoppingNeed & {
  requiredQuantity: number;
  availableQuantity: number;
  missingQuantity: number;
  estimatedPrice: number;
  savedEstimatedPrice: number;
  status: 'enough' | 'need_more' | 'not_available';
};

export function calculateSmartShoppingDiff(
  needs: ShoppingNeed[],
  inventory: InventoryAvailability[],
  today = new Date(),
) {
  const todayStart = startOfDay(today);
  const availableByIngredient = new Map<string, number>();

  inventory.forEach((item) => {
    if (isExpired(item.expirationDate, todayStart)) return;
    const current = availableByIngredient.get(item.ingredientId) || 0;
    availableByIngredient.set(
      item.ingredientId,
      current + Number(item.quantity || 0),
    );
  });

  const alreadyHave: ShoppingDiffItem[] = [];
  const toBuy: ShoppingDiffItem[] = [];

  needs.forEach((need) => {
    const requiredQuantity = roundQuantity(need.quantity);
    const availableQuantity = roundQuantity(
      Math.min(
        availableByIngredient.get(need.ingredientId) || 0,
        requiredQuantity,
      ),
    );
    const missingQuantity = roundQuantity(
      Math.max(requiredQuantity - availableQuantity, 0),
    );
    const savedEstimatedPrice = 0;

    const item: ShoppingDiffItem = {
      ...need,
      quantity: missingQuantity,
      requiredQuantity,
      availableQuantity,
      missingQuantity,
      estimatedPrice: 0,
      savedEstimatedPrice,
      status:
        missingQuantity <= 0
          ? 'enough'
          : availableQuantity > 0
            ? 'need_more'
            : 'not_available',
    };

    if (item.status === 'enough') {
      alreadyHave.push(item);
    } else {
      toBuy.push(item);
    }
  });

  return {
    alreadyHave,
    toBuy,
    summary: {
      enoughIngredients: alreadyHave.length,
      needToBuyIngredients: toBuy.length,
      unavailableIngredients: toBuy.filter(
        (item) => item.status === 'not_available',
      ).length,
      savedEstimatedTotal: 0,
    },
  };
}

function isExpired(value: Date | string | null | undefined, todayStart: Date) {
  if (!value) return false;
  return startOfDay(new Date(value)).getTime() < todayStart.getTime();
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function roundQuantity(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}
