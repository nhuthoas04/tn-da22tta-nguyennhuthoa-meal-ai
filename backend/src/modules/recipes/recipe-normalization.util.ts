type RecipeStepShape = {
  step: number;
  description: string;
};

type RecipeIngredientShape = {
  name: string;
  quantity: number;
  unit: string;
  isOptional: boolean;
};

const STEP_TEXT_KEYS = [
  'description',
  'content',
  'text',
  'instruction',
  'instructions',
  'value',
] as const;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

const isNumericOnly = (value: string) => /^\d+$/.test(value);

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const normalizeRecipeSteps = (rawSteps: unknown): RecipeStepShape[] => {
  if (!Array.isArray(rawSteps)) return [];

  return rawSteps
    .map((rawStep, index) => {
      let description = '';

      if (typeof rawStep === 'string' || typeof rawStep === 'number') {
        description = toTrimmedString(rawStep);
      } else if (isPlainObject(rawStep)) {
        for (const key of STEP_TEXT_KEYS) {
          const candidate = toTrimmedString(rawStep[key]);
          if (candidate && !isNumericOnly(candidate)) {
            description = candidate;
            break;
          }
        }

        if (!description) {
          description =
            Object.values(rawStep)
              .map(toTrimmedString)
              .find((candidate) => candidate && !isNumericOnly(candidate)) || '';
        }
      }

      if (!description || isNumericOnly(description)) {
        return null;
      }

      return {
        step: index + 1,
        description,
      };
    })
    .filter((step): step is RecipeStepShape => step !== null)
    .map((step, index) => ({
      ...step,
      step: index + 1,
    }));
};

export const normalizeRecipeIngredients = (
  rawIngredients: unknown,
): RecipeIngredientShape[] => {
  if (!Array.isArray(rawIngredients)) return [];

  return rawIngredients
    .map((rawIngredient) => {
      if (!isPlainObject(rawIngredient)) return null;

      const name = toTrimmedString(rawIngredient.name);
      const unit = toTrimmedString(rawIngredient.unit);
      if (!name || !unit) return null;

      return {
        name,
        quantity: toFiniteNumber(rawIngredient.quantity, 0),
        unit,
        isOptional: Boolean(rawIngredient.isOptional),
      };
    })
    .filter(
      (ingredient): ingredient is RecipeIngredientShape => ingredient !== null,
    );
};

export const normalizeRecipeScalarData = <
  T extends {
    name?: string;
    description?: string;
    imageUrl?: string;
    cookingTime?: number;
    servings?: number;
    difficulty?: string;
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    tags?: string[];
    mealType?: string[];
    cuisineRegion?: string;
    estimatedCost?: number;
  },
>(
  dto: T,
) => ({
  ...dto,
  name: toTrimmedString(dto.name),
  description: toTrimmedString(dto.description) || null,
  imageUrl: toTrimmedString(dto.imageUrl) || null,
  cookingTime: Math.max(1, Math.round(toFiniteNumber(dto.cookingTime, 0))),
  servings: Math.max(1, Math.round(toFiniteNumber(dto.servings, 4))),
  difficulty: toTrimmedString(dto.difficulty) || 'easy',
  calories: Math.max(0, Math.round(toFiniteNumber(dto.calories, 0))),
  protein: Math.max(0, toFiniteNumber(dto.protein, 0)),
  carbs: Math.max(0, toFiniteNumber(dto.carbs, 0)),
  fat: Math.max(0, toFiniteNumber(dto.fat, 0)),
  tags: Array.isArray(dto.tags)
    ? dto.tags.map(toTrimmedString).filter(Boolean)
    : [],
  mealType: Array.isArray(dto.mealType)
    ? dto.mealType.map(toTrimmedString).filter(Boolean)
    : [],
  cuisineRegion: toTrimmedString(dto.cuisineRegion) || null,
  estimatedCost: Math.max(0, toFiniteNumber(dto.estimatedCost, 0)),
});

export const normalizeRecipeForRead = <
  T extends {
    steps?: unknown;
    calories?: unknown;
    protein?: unknown;
    carbs?: unknown;
    fat?: unknown;
  },
>(
  recipe: T,
) => ({
  ...recipe,
  steps: normalizeRecipeSteps(recipe.steps),
  calories: toFiniteNumber(recipe.calories, 0),
  protein: toFiniteNumber(recipe.protein, 0),
  carbs: toFiniteNumber(recipe.carbs, 0),
  fat: toFiniteNumber(recipe.fat, 0),
});
