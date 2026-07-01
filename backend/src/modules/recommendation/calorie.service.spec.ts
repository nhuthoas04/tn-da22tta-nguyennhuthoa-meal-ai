import { CalorieService } from './calorie.service';
import { User } from '../auth/entities/user.entity';

describe('CalorieService health goals', () => {
  const service = new CalorieService();

  const createUser = (
    tdee: number,
    gender: string,
    healthConditions: string,
  ) =>
    ({
      dailyCalorieTarget: tdee,
      gender,
      preferences: { healthConditions },
    }) as User;

  it('keeps TDEE for users without a calorie-changing goal', () => {
    const result = service.getUserCalorieTargets(
      createUser(2666, 'male', 'diabetes'),
    );

    expect(result.adjustedDailyTarget).toBe(2666);
    expect(result.goal).toBe('maintenance');
  });

  it('reduces weight-loss calories and applies meal distribution', () => {
    const result = service.getUserCalorieTargets(
      createUser(2666, 'male', 'weight_loss'),
    );

    expect(result.adjustedDailyTarget).toBe(2266);
    expect(result.meals).toEqual({
      breakfast: 680,
      lunch: 906,
      dinner: 680,
    });
  });

  it('does not go below the gender safety minimum', () => {
    expect(
      service.getUserCalorieTargets(
        createUser(1400, 'male', 'weight_loss'),
      ).adjustedDailyTarget,
    ).toBe(1500);
    expect(
      service.getUserCalorieTargets(
        createUser(1000, 'female', 'weight_loss'),
      ).adjustedDailyTarget,
    ).toBe(1200);
  });

  it('increases the target for muscle gain', () => {
    const result = service.getUserCalorieTargets(
      createUser(2000, 'female', 'muscle_gain'),
    );

    expect(result.adjustedDailyTarget).toBe(2200);
    expect(result.goal).toBe('muscle_gain');
  });
});
