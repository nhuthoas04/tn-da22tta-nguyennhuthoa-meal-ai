export const ACTIVITY_FACTORS: Record<string, { label: string; factor: number }> = {
  sedentary: { label: 'Ít vận động', factor: 1.2 },
  light: { label: 'Nhẹ', factor: 1.375 },
  moderate: { label: 'Trung bình', factor: 1.55 },
  active: { label: 'Nhiều', factor: 1.725 },
  very_active: { label: 'Rất nhiều', factor: 1.9 },
};

export const HEALTH_CONDITIONS = {
  diabetes: 'diabetes',
  hypertension: 'hypertension',
  weightLoss: 'weight_loss',
  muscleGain: 'muscle_gain',
} as const;

export function parseHealthConditions(value?: string | null) {
  return String(value || '')
    .split(',')
    .map((condition) => condition.trim().toLowerCase())
    .filter(Boolean);
}

export function getAdjustedDailyCalorieTarget(
  tdee: number,
  gender?: string | null,
  healthConditions?: string | null,
) {
  if (!Number.isFinite(tdee) || tdee <= 0) return 0;
  const conditions = parseHealthConditions(healthConditions);

  if (conditions.includes(HEALTH_CONDITIONS.weightLoss)) {
    const minimum = gender?.toLowerCase() === 'male' ? 1500 : 1200;
    return Math.max(minimum, Math.round(tdee * 0.85));
  }
  if (conditions.includes(HEALTH_CONDITIONS.muscleGain)) {
    return Math.round(tdee * 1.1);
  }
  return Math.round(tdee);
}

export function getDailyMealCalorieTargets(dailyTarget: number) {
  return {
    breakfast: Math.round(dailyTarget * 0.3),
    lunch: Math.round(dailyTarget * 0.4),
    dinner: Math.round(dailyTarget * 0.3),
  };
}

type TdeeInput = {
  weight?: number | string | null;
  height?: number | string | null;
  gender?: string | null;
  dateOfBirth?: string | Date | null;
  activityLevel?: string | null;
};

export type TdeeResult =
  | { valid: false; msg: string }
  | {
      valid: true;
      weight: number;
      height: number;
      gender: 'male' | 'female';
      genderLabel: string;
      age: number;
      activityLevel: string;
      activityLabel: string;
      activityFactor: number;
      bmr: number;
      tdee: number;
      breakdown: {
        breakfast: number;
        lunch: number;
        dinner: number;
      };
    };

export function calculateTdee(input: TdeeInput): TdeeResult {
  const weight = Number(input.weight);
  const height = Number(input.height);

  if (!Number.isFinite(weight) || !Number.isFinite(height) || weight <= 0 || height <= 0) {
    return {
      valid: false,
      msg: 'Vui lòng nhập Chiều cao và Cân nặng hợp lệ để hệ thống tính nhu cầu calo.',
    };
  }

  const gender = input.gender?.trim().toLowerCase();
  if (gender !== 'male' && gender !== 'female') {
    return {
      valid: false,
      msg: 'Vui lòng chọn Giới tính để tính nhu cầu calo chính xác.',
    };
  }

  if (!input.dateOfBirth) {
    return {
      valid: false,
      msg: 'Vui lòng chọn Ngày sinh để tính nhu cầu calo chính xác.',
    };
  }

  const birthDate = parseDate(input.dateOfBirth);
  if (!birthDate) {
    return { valid: false, msg: 'Ngày sinh không hợp lệ.' };
  }

  const age = calculateAge(birthDate);
  if (age < 1) {
    return { valid: false, msg: 'Ngày sinh không hợp lệ.' };
  }

  const activityLevel = input.activityLevel || 'moderate';
  const activity = ACTIVITY_FACTORS[activityLevel] || ACTIVITY_FACTORS.moderate;
  const genderOffset = gender === 'male' ? 5 : -161;
  const bmr = 10 * weight + 6.25 * height - 5 * age + genderOffset;
  const tdee = Math.round(bmr * activity.factor);

  return {
    valid: true,
    weight,
    height,
    gender,
    genderLabel: gender === 'male' ? 'Nam' : 'Nữ',
    age,
    activityLevel,
    activityLabel: activity.label,
    activityFactor: activity.factor,
    bmr: Math.round(bmr),
    tdee,
    breakdown: getDailyMealCalorieTargets(tdee),
  };
}

function parseDate(value: string | Date): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const datePart = value.split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function calculateAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age;
}
