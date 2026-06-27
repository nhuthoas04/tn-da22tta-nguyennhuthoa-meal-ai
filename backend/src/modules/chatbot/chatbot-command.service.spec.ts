import { ChatbotCommandService } from './chatbot-command.service';
import { ChatbotIntentService } from './chatbot-intent.service';
import { EMPTY_CHATBOT_CONTEXT } from './chatbot.types';

describe('ChatbotCommandService full-day follow-up', () => {
  it('keeps the pending date when the user answers "tất cả"', async () => {
    const intentService = new ChatbotIntentService();
    const actionHandler = {
      handleAction: jest.fn(),
    };
    const aiService = {
      isAIAvailable: jest.fn().mockReturnValue(true),
    };
    const context = {
      ...EMPTY_CHATBOT_CONTEXT,
      pendingQuestion: {
        intent: 'REMOVE_MEAL_ITEM' as const,
        entities: {
          date: '2026-06-28',
          scope: 'meal' as const,
          clearMealItems: true,
        },
        missing: 'mealType' as const,
      },
    };
    const chatMessageRepo = {
      findOne: jest.fn().mockResolvedValue({
        metadata: { context },
      }),
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ChatbotCommandService(
      intentService,
      actionHandler as any,
      aiService as any,
      chatMessageRepo as any,
      {} as any,
    );

    const response = await service.sendMessage('user-1', 'tất cả');

    expect(response.requiresConfirmation).toBe(true);
    expect(response.entities).toMatchObject({
      date: '2026-06-28',
      scope: 'day',
      clearMealItems: true,
    });
    expect(response.entities?.mealType).toBeUndefined();
    expect(response.text).toContain('2026-06-28');
    expect(actionHandler.handleAction).not.toHaveBeenCalled();
  });

  it('creates today only and passes the exact Sunday targetDate', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 28, 12, 0, 0));

    const intentService = new ChatbotIntentService();
    const actionHandler = {
      handleAction: jest
        .fn()
        .mockResolvedValueOnce({ id: 'plan-1', items: [] })
        .mockResolvedValueOnce({
          id: 'plan-1',
          targetDate: '2026-06-28',
          items: [
            { id: 'lunch-1', mealDate: '2026-06-28', mealType: 'lunch' },
          ],
          message: 'Tôi đã tạo thực đơn cho ngày 28/06/2026.',
        }),
    };
    const aiService = {
      isAIAvailable: jest.fn().mockReturnValue(true),
    };
    const chatMessageRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ChatbotCommandService(
      intentService,
      actionHandler as any,
      aiService as any,
      chatMessageRepo as any,
      {} as any,
    );

    const response = await service.sendMessage(
      'user-1',
      'tạo thực đơn hôm nay',
    );

    expect(response.success).toBe(true);
    expect(response.text).toBe(
      'Tôi đã tạo thực đơn cho ngày 28/06/2026.',
    );
    expect(actionHandler.handleAction).toHaveBeenLastCalledWith(
      'generate_meal_plan_for_days',
      expect.objectContaining({
        targetDate: '2026-06-28',
        mealDates: ['2026-06-28'],
        mealTypes: ['lunch', 'dinner'],
        scope: 'day',
        source: 'chatbot',
      }),
      'user-1',
    );

    jest.useRealTimers();
  });

  it('rejects a past date without asking for replacement confirmation', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 28, 12, 0, 0));

    const intentService = new ChatbotIntentService();
    const actionHandler = {
      handleAction: jest.fn(),
    };
    const aiService = {
      isAIAvailable: jest.fn().mockReturnValue(true),
    };
    const chatMessageRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ChatbotCommandService(
      intentService,
      actionHandler as any,
      aiService as any,
      chatMessageRepo as any,
      {} as any,
    );

    const response = await service.sendMessage(
      'user-1',
      'tạo lại thực đơn ngày 27/06',
    );

    expect(response).toMatchObject({
      success: false,
      reason: 'PAST_DATE_READONLY',
    });
    expect(response.requiresConfirmation).toBeUndefined();
    expect(response.text).toBe(
      'Ngày này đã qua nên không thể tạo lại thực đơn. Bạn chỉ có thể xem lại thực đơn.',
    );
    expect(actionHandler.handleAction).not.toHaveBeenCalled();

    jest.useRealTimers();
  });
});
