export const HEALTH_CONDITIONS = {
  DIABETES: 'diabetes',
  HYPERTENSION: 'hypertension',
  WEIGHT_LOSS: 'weight_loss',
  MUSCLE_GAIN: 'muscle_gain',
} as const;

export type HealthCondition =
  (typeof HEALTH_CONDITIONS)[keyof typeof HEALTH_CONDITIONS];

export const parseHealthConditions = (value?: string | null): string[] =>
  String(value || '')
    .split(',')
    .map((condition) => condition.trim().toLowerCase())
    .filter(Boolean);
