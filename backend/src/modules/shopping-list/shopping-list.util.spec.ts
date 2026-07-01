import {
  calculateServingFactor,
  calculateSmartShoppingDiff,
} from './shopping-list.util';

const needs = [
  {
    ingredientId: 'beef',
    name: 'Thịt bò',
    quantity: 1000,
    unit: 'g',
    category: 'Thịt / Cá',
    pricePerUnit: 50000,
  },
];

describe('calculateSmartShoppingDiff', () => {
  it('không thêm vào shopping list khi nguyên liệu đã đủ', () => {
    const result = calculateSmartShoppingDiff(
      needs,
      [{ ingredientId: 'beef', quantity: 1200, unit: 'g' }],
      new Date('2026-06-14'),
    );

    expect(result.toBuy).toHaveLength(0);
    expect(result.alreadyHave).toHaveLength(1);
    expect(result.alreadyHave[0].status).toBe('enough');
  });

  it('chỉ thêm phần còn thiếu khi nguyên liệu chưa đủ', () => {
    const result = calculateSmartShoppingDiff(
      needs,
      [{ ingredientId: 'beef', quantity: 600, unit: 'g' }],
      new Date('2026-06-14'),
    );

    expect(result.toBuy).toHaveLength(1);
    expect(result.toBuy[0].requiredQuantity).toBe(1000);
    expect(result.toBuy[0].availableQuantity).toBe(600);
    expect(result.toBuy[0].missingQuantity).toBe(400);
    expect(result.toBuy[0].status).toBe('need_more');
  });

  it('không tính nguyên liệu đã hết hạn là còn trong tủ lạnh', () => {
    const result = calculateSmartShoppingDiff(
      needs,
      [
        {
          ingredientId: 'beef',
          quantity: 1000,
          unit: 'g',
          expirationDate: '2026-06-13',
        },
      ],
      new Date('2026-06-14'),
    );

    expect(result.toBuy).toHaveLength(1);
    expect(result.toBuy[0].availableQuantity).toBe(0);
    expect(result.toBuy[0].missingQuantity).toBe(1000);
    expect(result.toBuy[0].status).toBe('not_available');
  });

  it('tính lại phần cần mua khi số lượng trong tủ lạnh thay đổi', () => {
    const before = calculateSmartShoppingDiff(
      needs,
      [{ ingredientId: 'beef', quantity: 600, unit: 'g' }],
      new Date('2026-06-14'),
    );
    const after = calculateSmartShoppingDiff(
      needs,
      [{ ingredientId: 'beef', quantity: 900, unit: 'g' }],
      new Date('2026-06-14'),
    );

    expect(before.toBuy[0].missingQuantity).toBe(400);
    expect(after.toBuy[0].missingQuantity).toBe(100);
  });
});

describe('calculateServingFactor', () => {
  it('scales recipe ingredients from one serving to family servings', () => {
    expect(calculateServingFactor(4, 1)).toBe(4);
  });

  it('scales recipe ingredients relative to the original recipe servings', () => {
    expect(calculateServingFactor(4, 2)).toBe(2);
    expect(calculateServingFactor(4, 4)).toBe(1);
  });

  it('does not change per-person calories; it only returns an ingredient quantity factor', () => {
    const caloriesPerServing = 450;
    const factor = calculateServingFactor(4, 1);

    expect(caloriesPerServing).toBe(450);
    expect(caloriesPerServing * factor).toBe(1800);
    expect(factor).toBe(4);
  });
});
