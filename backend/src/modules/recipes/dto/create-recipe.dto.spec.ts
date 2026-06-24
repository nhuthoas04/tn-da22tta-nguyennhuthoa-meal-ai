import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateRecipeDto } from './create-recipe.dto';

describe('CreateRecipeDto', () => {
  it('accepts normalized submit payload with nested steps and ingredients', async () => {
    const dto = plainToInstance(CreateRecipeDto, {
      name: 'Goi cuon tom thit',
      description: 'Mon an tuoi mat',
      cookingTime: 25,
      servings: 4,
      difficulty: 'easy',
      calories: 200,
      protein: 18,
      carbs: 20,
      fat: 4,
      tags: [],
      mealType: ['lunch'],
      steps: [
        { step: 1, description: 'Luoc tom va thit heo.' },
        { step: 2, description: 'Cuon voi rau va bun.' },
      ],
      ingredients: [
        { name: 'Tom', quantity: 200, unit: 'g' },
        { name: 'Thit heo', quantity: 200, unit: 'g' },
      ],
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toHaveLength(0);
    expect(dto.steps).toEqual([
      { step: 1, description: 'Luoc tom va thit heo.' },
      { step: 2, description: 'Cuon voi rau va bun.' },
    ]);
    expect(dto.ingredients).toEqual([
      { name: 'Tom', quantity: 200, unit: 'g', isOptional: false },
      { name: 'Thit heo', quantity: 200, unit: 'g', isOptional: false },
    ]);
  });

  it('accepts string step payloads and converts them to DTO instances', async () => {
    const dto = plainToInstance(CreateRecipeDto, {
      name: 'Canh rau',
      cookingTime: 15,
      calories: 120,
      steps: ['Rua rau', 'Nau canh'],
      ingredients: [{ name: 'Rau', quantity: 100, unit: 'g' }],
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toHaveLength(0);
    expect(dto.steps).toEqual([
      { step: 1, description: 'Rua rau' },
      { step: 2, description: 'Nau canh' },
    ]);
  });
});
