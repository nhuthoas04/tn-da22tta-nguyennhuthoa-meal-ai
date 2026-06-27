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
});
