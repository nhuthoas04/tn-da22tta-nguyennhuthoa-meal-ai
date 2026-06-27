import { ChatbotIntentService } from './chatbot-intent.service';

describe('ChatbotIntentService meal-plan deletion', () => {
  const service = new ChatbotIntentService();

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 28, 12, 0, 0));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('treats "xóa các món ngày 28/06" as a full-day deletion', () => {
    const result = service.detect('xóa các món ngày 28/06');

    expect(result.intent).toBe('REMOVE_MEAL_ITEM');
    expect(result.entities).toMatchObject({
      date: '2026-06-28',
      scope: 'day',
      period: 'day',
      clearMealItems: true,
    });
    expect(result.entities.mealType).toBeUndefined();
    expect(result.entities.recipeName).toBeUndefined();
  });

  it('treats "xóa hết món ngày mai" as a full-day deletion', () => {
    const result = service.detect('xóa hết món ngày mai');

    expect(result.entities).toMatchObject({
      date: '2026-06-29',
      scope: 'day',
      clearMealItems: true,
    });
  });

  it('keeps an explicit dinner deletion scoped to dinner', () => {
    const result = service.detect('xóa món bữa tối ngày mai');

    expect(result.entities).toMatchObject({
      date: '2026-06-29',
      mealType: 'dinner',
      scope: 'meal',
      clearMealItems: true,
    });
  });

  it('keeps "xóa món ngày mai" ambiguous so the bot can clarify', () => {
    const result = service.detect('xóa món ngày mai');

    expect(result.entities).toMatchObject({
      date: '2026-06-29',
      scope: 'meal',
    });
    expect(result.entities.mealType).toBeUndefined();
    expect(result.entities.recipeName).toBeUndefined();
  });

  it('recognizes a past full-day deletion request without changing its date', () => {
    const result = service.detect('xóa các món ngày hôm qua');

    expect(result.entities).toMatchObject({
      date: '2026-06-27',
      scope: 'day',
      clearMealItems: true,
    });
  });
});
