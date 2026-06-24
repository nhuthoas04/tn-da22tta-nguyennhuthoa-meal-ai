import {
  normalizeRecipeForRead,
  normalizeRecipeIngredients,
  normalizeRecipeScalarData,
  normalizeRecipeSteps,
} from './recipe-normalization.util';

describe('recipe-normalization.util', () => {
  it('normalizes step objects and string arrays into clean descriptions', () => {
    expect(
      normalizeRecipeSteps([
        ' Luoc tom ',
        { step: 99, content: 'Cuon voi rau song' },
        { stepNumber: 3, description: '3' },
      ]),
    ).toEqual([
      { step: 1, description: 'Luoc tom' },
      { step: 2, description: 'Cuon voi rau song' },
    ]);
  });

  it('normalizes ingredient rows and removes invalid entries', () => {
    expect(
      normalizeRecipeIngredients([
        { name: ' Tom ', quantity: '200', unit: ' g ' },
        { name: '', quantity: 1, unit: 'g' },
      ]),
    ).toEqual([{ name: 'Tom', quantity: 200, unit: 'g', isOptional: false }]);
  });

  it('normalizes scalar nutrition data without dropping submitted calories', () => {
    expect(
      normalizeRecipeScalarData({
        name: ' Goi cuon ',
        calories: '220' as unknown as number,
        protein: '18' as unknown as number,
        carbs: '20.5' as unknown as number,
        fat: '4' as unknown as number,
        cookingTime: '25' as unknown as number,
      }),
    ).toMatchObject({
      name: 'Goi cuon',
      calories: 220,
      protein: 18,
      carbs: 20.5,
      fat: 4,
      cookingTime: 25,
    });
  });

  it('normalizes read data and removes malformed numeric-only steps', () => {
    expect(
      normalizeRecipeForRead({
        calories: '0',
        protein: '0.00',
        carbs: '11.00',
        fat: '0.00',
        steps: [{ step: 1, description: '1' }, { step: 2, content: 'Pha nuoc mam' }],
      }),
    ).toEqual({
      calories: 0,
      protein: 0,
      carbs: 11,
      fat: 0,
      steps: [{ step: 1, description: 'Pha nuoc mam' }],
    });
  });
});
