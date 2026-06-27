import { ChatbotActionHandler } from './chatbot-action.handler';

describe('ChatbotActionHandler remove_meal_day', () => {
  const userId = 'user-1';
  let mealPlanService: {
    findByWeek: jest.Mock;
    removeItem: jest.Mock;
    generateForDays: jest.Mock;
  };
  let handler: ChatbotActionHandler;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 28, 12, 0, 0));
    mealPlanService = {
      findByWeek: jest.fn(),
      removeItem: jest.fn().mockResolvedValue(undefined),
      generateForDays: jest.fn(),
    };
    handler = new ChatbotActionHandler(
      {} as any,
      {} as any,
      {} as any,
      mealPlanService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('deletes only editable meal slots on today and preserves past meals', async () => {
    const plan = {
      id: 'plan-1',
      items: [
        { id: 'breakfast-1', mealDate: '2026-06-28', mealType: 'breakfast' },
        { id: 'lunch-1', mealDate: '2026-06-28', mealType: 'lunch' },
        { id: 'dinner-1', mealDate: '2026-06-28', mealType: 'dinner' },
        { id: 'other-day', mealDate: '2026-06-29', mealType: 'dinner' },
      ],
    };
    mealPlanService.findByWeek
      .mockResolvedValueOnce(plan)
      .mockResolvedValueOnce({
        ...plan,
        items: [plan.items[0], plan.items[3]],
      });

    const result = await handler.handleAction(
      'remove_meal_day',
      { mealDate: '2026-06-28' },
      userId,
    );

    expect(mealPlanService.removeItem).toHaveBeenCalledTimes(2);
    expect(mealPlanService.removeItem).not.toHaveBeenCalledWith(
      userId,
      'plan-1',
      'breakfast-1',
    );
    expect(mealPlanService.removeItem).toHaveBeenCalledWith(
      userId,
      'plan-1',
      'lunch-1',
    );
    expect(mealPlanService.removeItem).toHaveBeenCalledWith(
      userId,
      'plan-1',
      'dinner-1',
    );
    expect(result.removedCount).toBe(2);
    expect(result.message).toBe(
      'Tôi đã xóa tất cả món trong thực đơn ngày 28/06/2026 của bạn.',
    );
  });

  it('does not delete a past day', async () => {
    const result = await handler.handleAction(
      'remove_meal_day',
      { mealDate: '2026-06-27' },
      userId,
    );

    expect(mealPlanService.findByWeek).not.toHaveBeenCalled();
    expect(mealPlanService.removeItem).not.toHaveBeenCalled();
    expect(result.message).toBe(
      'Ngày 27/06/2026 đã qua nên không thể xóa thực đơn. Bạn chỉ có thể xem lại thực đơn ngày đó.',
    );
  });

  it('reports an empty day instead of claiming a successful deletion', async () => {
    mealPlanService.findByWeek.mockResolvedValue({
      id: 'plan-1',
      items: [],
    });

    const result = await handler.handleAction(
      'remove_meal_day',
      { mealDate: '2026-06-29' },
      userId,
    );

    expect(mealPlanService.removeItem).not.toHaveBeenCalled();
    expect(result.message).toBe(
      'Ngày 29/06/2026 hiện chưa có món nào để xóa.',
    );
  });

  it('uses targetDate as the authoritative date and skips past meal slots today', async () => {
    mealPlanService.generateForDays.mockResolvedValue({
      id: 'plan-1',
      items: [
        { id: 'lunch-1', mealDate: '2026-06-28', mealType: 'lunch' },
        { id: 'dinner-1', mealDate: '2026-06-28', mealType: 'dinner' },
      ],
    });

    const result = await handler.handleAction(
      'generate_meal_plan_for_days',
      {
        targetDate: '2026-06-28',
        mealDates: ['2026-06-27'],
        scope: 'day',
        source: 'meal_planner_button',
      },
      userId,
    );

    expect(mealPlanService.generateForDays).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        targetDate: '2026-06-28',
        mealDates: ['2026-06-28'],
        mealTypes: ['lunch', 'dinner'],
        scope: 'day',
        source: 'meal_planner_button',
      }),
    );
    expect(result.targetDate).toBe('2026-06-28');
    expect(result.message).toBe(
      'Tôi đã tạo thực đơn cho ngày 28/06/2026.',
    );
  });

  it('rejects generation for a past targetDate before calling MealPlanService', async () => {
    const result = await handler.handleAction(
      'generate_meal_plan_for_days',
      { targetDate: '2026-06-27', mealDates: ['2026-06-28'] },
      userId,
    );

    expect(mealPlanService.generateForDays).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      reason: 'PAST_DATE_READONLY',
      message: 'Ngày này đã qua nên không thể tạo lại thực đơn.',
    });
  });
});
