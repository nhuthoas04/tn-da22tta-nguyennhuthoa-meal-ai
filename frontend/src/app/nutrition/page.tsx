'use client';

import { useCallback, useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { mealPlanAPI, recommendationAPI } from '@/lib/api';
import {
  getMealPlanUpdateDetailFromEvent,
  getStoredMealPlanUpdateVersion,
  MEAL_PLAN_UPDATED_EVENT,
  MEAL_PLAN_UPDATE_STORAGE_KEY,
  parseMealPlanUpdateVersion,
} from '@/lib/mealPlanEvents';
import { NutrientByDayChart, WeeklyCaloriesChart } from '@/components/NutritionCharts';
import {
  HiArrowLeft,
  HiChartBar,
  HiCheckCircle,
  HiExclamationCircle,
  HiInformationCircle,
  HiLightBulb,
  HiSparkles,
  HiTrendingUp,
  HiChevronDown,
  HiChevronUp,
  HiQuestionMarkCircle,
} from 'react-icons/hi';

type NutritionTab = 'nutrition-data' | 'ai-insights';

/* ------------------------------------------------------------------ */
/*                            TYPE DEFINITIONS                        */
/* ------------------------------------------------------------------ */

type DailyNutrition = {
  day: number;
  label: string;
  date?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  dishCount: number;
};

type NutritionData = {
  daily: DailyNutrition[];
  weeklyAvg: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  macroDistribution: {
    proteinPercent?: number;
    carbsPercent?: number;
    fatPercent?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  };
  calorieTarget: number;
  tdeeCalories?: number;
  calorieGoal?: 'weight_loss' | 'muscle_gain' | 'maintenance';
  totalDishes: number;
  dataDays?: number;
  incompleteNutritionCount?: number;
};

type AIAnalysis = {
  strengths?: string[];
  warnings?: string[];
  weaknesses?: string[];
  recommendations?: string[];
  analysis?: string;
  dataDays?: number;
  incompleteNutritionCount?: number;
  targetCalories?: number | null;
};

type MacroTargets = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type NutrientStatus = {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
};

/* ------------------------------------------------------------------ */
/*                            HELPERS                                 */
/* ------------------------------------------------------------------ */

const formatDateInput = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const getMonday = () => {
  const date = new Date();
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return formatDateInput(date);
};

const formatNumber = (value?: number | string) =>
  Math.round(Number(value) || 0).toLocaleString('vi-VN');

const hasNutritionData = (data: NutritionData | null) => {
  if (!data) return false;
  const totalDishes =
    Number(data.totalDishes) ||
    data.daily.reduce((sum, day) => sum + (Number(day.dishCount) || 0), 0);
  return totalDishes > 0;
};

const computeMacroTargets = (calorieTarget: number, minProteinPerMeal?: number | null): MacroTargets => {
  if (!calorieTarget || calorieTarget <= 0) {
    return {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    };
  }

  return {
    calories: Math.round(calorieTarget),
    protein: minProteinPerMeal && minProteinPerMeal > 0
      ? Math.round(minProteinPerMeal * 3)
      : Math.round((calorieTarget * 0.15) / 4),
    carbs: Math.round((calorieTarget * 0.55) / 4),
    fat: Math.round((calorieTarget * 0.30) / 9),
  };
};

const getCaloriesStatus = (value: number, target: number): NutrientStatus => {
  if (target <= 0) return { label: 'Chưa có mục tiêu', color: 'text-slate-500', bgColor: 'bg-slate-50', borderColor: 'border-slate-200' };
  const ratio = value / target;
  if (ratio < 0.7) return { label: 'Còn thấp', color: 'text-amber-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-200' };
  if (ratio <= 1.0) return { label: 'Hợp lý', color: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200' };
  if (ratio <= 1.15) return { label: 'Hơi cao', color: 'text-orange-600', bgColor: 'bg-orange-50', borderColor: 'border-orange-200' };
  return { label: 'Vượt mục tiêu', color: 'text-red-600', bgColor: 'bg-red-50', borderColor: 'border-red-200' };
};

const actualDataStatus: NutrientStatus = {
  label: 'Số liệu thực tế',
  color: 'text-slate-600',
  bgColor: 'bg-white',
  borderColor: 'border-slate-200',
};

/* ------------------------------------------------------------------ */
/*                         TODAY HELPERS                              */
/* ------------------------------------------------------------------ */

const getTodayDayIndex = () => {
  const d = new Date();
  const day = d.getDay();
  return day === 0 ? 6 : day - 1; // 0=Mon ... 6=Sun
};

const getTodayNutrition = (daily: DailyNutrition[]): DailyNutrition | null => {
  const todayStr = formatDateInput(new Date());
  const byDate = daily.find((d) => d.date === todayStr);
  if (byDate) return byDate;
  const idx = getTodayDayIndex();
  return daily[idx] || null;
};

/* ------------------------------------------------------------------ */
/*                       MAIN PAGE COMPONENT                         */
/* ------------------------------------------------------------------ */

export default function NutritionPage() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [nutrition, setNutrition] = useState<NutritionData | null>(null);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<NutritionTab>('nutrition-data');
  const [weekStart] = useState(() => getMonday());
  const nutritionRef = useRef<NutritionData | null>(null);
  const lastMealPlanVersionRef = useRef<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    nutritionRef.current = nutrition;
  }, [nutrition]);

  const fetchNutritionData = useCallback(async ({ showLoading = true } = {}) => {
    if (!user) {
      setLoading(false);
      return;
    }

    if (showLoading) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);
    setAnalysisError(null);

    try {
      let nextNutrition: NutritionData | null = null;
      const mealPlanResponse = await mealPlanAPI.get(weekStart);
      const currentPlan = mealPlanResponse.data;

      if (currentPlan?.id) {
        const nutritionResponse = await mealPlanAPI.getNutrition(currentPlan.id);
        nextNutrition = nutritionResponse.data;
      }

      setNutrition(hasNutritionData(nextNutrition) ? nextNutrition : null);

      try {
        const aiAnalysisResponse = await recommendationAPI.getNutritionAnalysis(weekStart);
        setAnalysis(aiAnalysisResponse.data);
      } catch (analysisFetchError) {
        console.error('Error fetching AI nutrition analysis:', analysisFetchError);
        setAnalysis(null);
        setAnalysisError('Không thể tải phân tích AI cho thực đơn hiện tại. Vui lòng thử lại.');
      }

      lastMealPlanVersionRef.current = getStoredMealPlanUpdateVersion();
    } catch (fetchError) {
      console.error('Error fetching nutrition data:', fetchError);
      setNutrition(null);
      setAnalysis(null);
      setError('Không thể tải dữ liệu dinh dưỡng. Vui lòng thử lại.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, weekStart]);

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => { fetchNutritionData(); }, 0);
    return () => clearTimeout(timer);
  }, [user, fetchNutritionData]);

  const scheduleNutritionRefresh = useCallback((showLoading = false) => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = setTimeout(() => {
      fetchNutritionData({ showLoading });
    }, 150);
  }, [fetchNutritionData]);

  useEffect(() => {
    if (!user) return;

    const shouldRefreshForWeek = (eventWeekStart?: string) =>
      !eventWeekStart || eventWeekStart === weekStart;

    const handleMealPlanUpdated = (event: Event) => {
      const detail = getMealPlanUpdateDetailFromEvent(event);
      if (!shouldRefreshForWeek(detail?.weekStart)) return;
      scheduleNutritionRefresh(!nutritionRef.current);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== MEAL_PLAN_UPDATE_STORAGE_KEY) return;
      const detail = parseMealPlanUpdateVersion(event.newValue);
      if (!shouldRefreshForWeek(detail?.weekStart)) return;
      scheduleNutritionRefresh(!nutritionRef.current);
    };

    const refreshIfStoredVersionChanged = () => {
      const nextVersion = getStoredMealPlanUpdateVersion();
      if (!nextVersion || nextVersion === lastMealPlanVersionRef.current) return;
      const detail = parseMealPlanUpdateVersion(nextVersion);
      if (!shouldRefreshForWeek(detail?.weekStart)) return;
      scheduleNutritionRefresh(!nutritionRef.current);
    };

    window.addEventListener(MEAL_PLAN_UPDATED_EVENT, handleMealPlanUpdated);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', refreshIfStoredVersionChanged);
    window.addEventListener('pageshow', refreshIfStoredVersionChanged);
    document.addEventListener('visibilitychange', refreshIfStoredVersionChanged);

    return () => {
      window.removeEventListener(MEAL_PLAN_UPDATED_EVENT, handleMealPlanUpdated);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', refreshIfStoredVersionChanged);
      window.removeEventListener('pageshow', refreshIfStoredVersionChanged);
      document.removeEventListener('visibilitychange', refreshIfStoredVersionChanged);
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [user, weekStart, scheduleNutritionRefresh]);

  useEffect(() => {
    if (!user || pathname !== '/nutrition') return;
    const nextVersion = getStoredMealPlanUpdateVersion();
    if (!nextVersion || nextVersion === lastMealPlanVersionRef.current) return;
    const detail = parseMealPlanUpdateVersion(nextVersion);
    if (detail?.weekStart && detail.weekStart !== weekStart) return;
    scheduleNutritionRefresh(!nutritionRef.current);
  }, [pathname, user, weekStart, scheduleNutritionRefresh]);

  /* ---- Not logged in ---- */
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <div className="rounded-2xl border border-gray-100 bg-white p-10 shadow-sm">
            <HiChartBar className="mx-auto mb-4 h-14 w-14 text-brand-primary" />
            <h1 className="text-2xl font-bold text-gray-900">Dinh dưỡng & AI Insights</h1>
            <p className="mt-3 text-gray-600">
              Vui lòng đăng nhập để xem dữ liệu dinh dưỡng và phân tích AI theo thực đơn của bạn.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-flex rounded-xl bg-brand-primary px-5 py-3 font-semibold text-white hover:bg-brand-primary-hover"
            >
              Đăng nhập
            </Link>
          </div>
        </div>
      </div>
    );
  }

  /* ---- Compute targets & insights ---- */
  const calorieTarget = Number(
    nutrition?.calorieTarget ||
    (user as any).adjustedDailyCalorieTarget ||
    (user as any).dailyCalorieTarget,
  ) || 0;
  const tdeeTarget = Number(
    nutrition?.tdeeCalories || (user as any).dailyCalorieTarget,
  ) || 0;
  const targets = computeMacroTargets(calorieTarget, (user as any)?.preferences?.minProteinPerMeal);
  const trendInsights = nutrition
    ? buildTrendInsights(nutrition.daily, calorieTarget)
    : [];

  /* ---- Render ---- */
  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6">
      {/* SECTION 1 — Header */}
      <PageHeader />
      <NutritionInnerTabs activeTab={activeTab} onChange={setActiveTab} />
      {tdeeTarget > 0 && calorieTarget !== tdeeTarget && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-slate-700">
          <span>TDEE gốc: <strong>{formatNumber(tdeeTarget)} kcal</strong></span>
          <span>
            Mục tiêu theo sức khỏe:{' '}
            <strong className="text-emerald-700">{formatNumber(calorieTarget)} kcal/ngày</strong>
          </span>
        </div>
      )}

      {loading ? (
        <LoadingPanel />
      ) : error ? (
        <NutritionErrorState message={error} onRetry={() => fetchNutritionData()} />
      ) : activeTab === 'nutrition-data' ? (
        !nutrition ? (
          <NutritionDataEmptyState />
        ) : (
          <NutritionDataTab nutrition={nutrition} targets={targets} />
        )
      ) : (
        <AIInsightsSection
          analysis={analysis}
          analysisError={analysisError}
          trendInsights={trendInsights}
          onRetry={() => fetchNutritionData()}
        />
      )}

      {refreshing && !loading && (
        <div className="fixed bottom-6 right-6 rounded-full border border-brand-primary/20 bg-white px-4 py-2 text-sm font-semibold text-brand-primary shadow-lg">
          Đang đồng bộ dữ liệu dinh dưỡng...
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*                         SUB-COMPONENTS                             */
/* ================================================================== */

function NutritionInnerTabs({
  activeTab,
  onChange,
}: {
  activeTab: NutritionTab;
  onChange: (tab: NutritionTab) => void;
}) {
  const tabs = [
    { id: 'nutrition-data' as const, label: 'Dữ liệu dinh dưỡng', icon: HiChartBar },
    { id: 'ai-insights' as const, label: 'AI Insights', icon: HiSparkles },
  ];

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-2 shadow-sm">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold transition ${
                active
                  ? 'border-brand-primary/25 bg-brand-primary/10 text-brand-primary shadow-sm'
                  : 'border-gray-100 bg-white text-slate-650 hover:border-brand-primary/20 hover:bg-brand-primary/5'
              }`}
            >
              <Icon className="h-5 w-5" />
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NutritionDataTab({
  nutrition,
  targets,
}: {
  nutrition: NutritionData;
  targets: MacroTargets;
}) {
  return (
    <div className="space-y-8">
      <TodaySummaryCards daily={nutrition.daily} targets={targets} />
      <NutritionChartsSection
        daily={nutrition.daily}
        targets={targets}
      />
      <NutritionTable data={nutrition.daily} targets={targets} />
    </div>
  );
}

/* ---- 1. PAGE HEADER ---- */

function PageHeader() {
  return (
    <div className="rounded-2xl bg-gradient-to-r from-brand-primary to-brand-secondary p-6 text-white shadow-lg md:p-8">
      <Link
        href="/"
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-white/90 hover:text-white"
      >
        <HiArrowLeft className="h-4 w-4" />
        Về trang chủ
      </Link>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-white/80">
            MealAI Health Dashboard
          </p>
          <h1 className="mt-2 text-3xl font-bold md:text-4xl">Dinh dưỡng & AI Insights</h1>
          <p className="mt-3 max-w-3xl text-white/90">
            Theo dõi chỉ số dinh dưỡng theo tuần, nhận phân tích AI và gợi ý cải thiện chế độ ăn dựa trên thực đơn cá nhân.
          </p>
        </div>
        <div className="rounded-2xl bg-white/15 px-5 py-4 text-sm backdrop-blur shrink-0">
          <div className="font-semibold flex items-center gap-1.5">
            <HiInformationCircle className="text-base" />
            Nguồn dữ liệu
          </div>
          <div className="text-white/80 mt-1">Dữ liệu được tính từ toàn bộ món trong thực đơn tuần.</div>
        </div>
      </div>
    </div>
  );
}

/* ---- 2. GUIDE BOX (Collapsible) ---- */

function NutritionGuideBox() {
  const [expanded, setExpanded] = useState(false);

  const guides = [
    { emoji: '🔥', name: 'Calories', tooltip: 'Năng lượng từ món ăn, dùng để so sánh với mục tiêu TDEE.', desc: 'Tổng năng lượng nạp vào trong ngày, tính bằng kcal.' },
    { emoji: '💪', name: 'Protein', tooltip: 'Chất đạm, cần cho cơ bắp và phục hồi.', desc: 'Chất đạm, hỗ trợ cơ bắp và phục hồi cơ thể.' },
    { emoji: '⚡', name: 'Carbs', tooltip: 'Nguồn năng lượng chính từ tinh bột và đường.', desc: 'Tinh bột/đường, cung cấp năng lượng chính cho hoạt động.' },
    { emoji: '🫒', name: 'Fat', tooltip: 'Chất béo, cần thiết nhưng nên kiểm soát.', desc: 'Chất béo, cần thiết nhưng không nên vượt quá mức khuyến nghị.' },
  ];

  return (
    <div className="rounded-2xl border border-brand-primary/15 bg-gradient-to-br from-emerald-50/60 via-white to-teal-50/40 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-brand-primary/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-brand-primary/10 p-2 text-brand-primary">
            <HiQuestionMarkCircle className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">Hướng dẫn theo dõi dinh dưỡng</h3>
            <p className="text-xs text-gray-500 mt-0.5">Nhấn để xem giải thích các chỉ số</p>
          </div>
        </div>
        {expanded ? <HiChevronUp className="h-5 w-5 text-gray-400" /> : <HiChevronDown className="h-5 w-5 text-gray-400" />}
      </button>

      {expanded && (
        <div className="px-6 pb-5 space-y-4 animate-fade-in">
          <p className="text-sm text-gray-600 leading-relaxed">
            Trang này giúp bạn theo dõi năng lượng và các nhóm chất dinh dưỡng trong thực đơn tuần. Dữ liệu được tính từ các món ăn trong thực đơn và so sánh với mục tiêu cá nhân dựa trên hồ sơ của bạn.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {guides.map((g) => (
              <div
                key={g.name}
                className="group relative rounded-xl border border-gray-100 bg-white p-4 shadow-sm hover:border-brand-primary/30 hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{g.emoji}</span>
                  <span className="font-bold text-gray-900 text-sm">{g.name}</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{g.desc}</p>
                {/* Tooltip on hover */}
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20 pointer-events-none">
                  <div className="rounded-lg bg-gray-900 px-3 py-1.5 text-[11px] text-white whitespace-nowrap shadow-lg">
                    {g.tooltip}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- 3. TODAY SUMMARY CARDS ---- */

function TodaySummaryCards({ daily, targets }: { daily: DailyNutrition[]; targets: MacroTargets }) {
  const today = getTodayNutrition(daily);
  const cal = Number(today?.calories) || 0;
  const prot = Number(today?.protein) || 0;
  const carb = Number(today?.carbs) || 0;
  const fatVal = Number(today?.fat) || 0;
  const dishes = Number(today?.dishCount) || 0;

  const calStatus = getCaloriesStatus(cal, targets.calories);
  const calPct = targets.calories > 0 ? Math.min(100, Math.round((cal / targets.calories) * 100)) : undefined;

  const getMacroStatus = (value: number, target: number): NutrientStatus => {
    if (target <= 0) return { label: 'Chưa có mục tiêu', color: 'text-slate-500', bgColor: 'bg-slate-50', borderColor: 'border-slate-200' };
    const ratio = value / target;
    if (ratio < 0.7) return { label: 'Còn thấp', color: 'text-amber-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-200' };
    if (ratio <= 1.0) return { label: 'Hợp lý', color: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200' };
    if (ratio <= 1.15) return { label: 'Hơi cao', color: 'text-orange-600', bgColor: 'bg-orange-50', borderColor: 'border-orange-200' };
    return { label: 'Vượt mục tiêu', color: 'text-red-600', bgColor: 'bg-red-50', borderColor: 'border-red-200' };
  };

  const protPct = targets.protein > 0 ? Math.min(100, Math.round((prot / targets.protein) * 100)) : undefined;
  const carbPct = targets.carbs > 0 ? Math.min(100, Math.round((carb / targets.carbs) * 100)) : undefined;
  const fatPct = targets.fat > 0 ? Math.min(100, Math.round((fatVal / targets.fat) * 100)) : undefined;

  if (dishes === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center">
        <p className="text-gray-400 text-sm font-medium">Hôm nay chưa có món ăn nào trong thực đơn.</p>
        <Link href="/meal-planner" className="mt-3 inline-flex rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary-hover">
          Tạo thực đơn cho hôm nay
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          📊 Tổng quan hôm nay
          <span className="text-xs font-medium text-gray-400">({dishes} món)</span>
        </h2>
        {!targets.calories && (
          <Link href="/profile" className="text-xs font-semibold text-brand-primary hover:underline">
            Cập nhật mục tiêu →
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <TodayCard
          emoji="🔥"
          title="Calories"
          value={formatNumber(cal)}
          unit="kcal"
          target={targets.calories > 0 ? `/ ${formatNumber(targets.calories)} kcal` : 'Chưa có TDEE'}
          progress={calPct}
          status={calStatus}
          progressColor="bg-orange-500"
          tooltip="Năng lượng từ món ăn, dùng để so sánh với mục tiêu TDEE."
        />
        <TodayCard
          emoji="💪"
          title="Protein"
          value={formatNumber(prot)}
          unit="g"
          target={targets.protein > 0 ? `/ ${formatNumber(targets.protein)} g` : 'Chưa có mục tiêu'}
          progress={protPct}
          status={getMacroStatus(prot, targets.protein)}
          progressColor="bg-emerald-500"
          tooltip="Chất đạm, cần cho cơ bắp và phục hồi."
        />
        <TodayCard
          emoji="⚡"
          title="Carbs"
          value={formatNumber(carb)}
          unit="g"
          target={targets.carbs > 0 ? `/ ${formatNumber(targets.carbs)} g` : 'Chưa có mục tiêu'}
          progress={carbPct}
          status={getMacroStatus(carb, targets.carbs)}
          progressColor="bg-sky-500"
          tooltip="Nguồn năng lượng chính từ tinh bột và đường."
        />
        <TodayCard
          emoji="🫒"
          title="Fat"
          value={formatNumber(fatVal)}
          unit="g"
          target={targets.fat > 0 ? `/ ${formatNumber(targets.fat)} g` : 'Chưa có mục tiêu'}
          progress={fatPct}
          status={getMacroStatus(fatVal, targets.fat)}
          progressColor="bg-purple-500"
          tooltip="Chất béo, cần thiết nhưng nên kiểm soát."
        />
      </div>
    </div>
  );
}

function TodayCard({
  emoji,
  title,
  value,
  unit,
  target,
  progress,
  status,
  progressColor,
  tooltip,
}: {
  emoji: string;
  title: string;
  value: string;
  unit: string;
  target: string;
  progress?: number;
  status: NutrientStatus;
  progressColor: string;
  tooltip: string;
}) {
  return (
    <div className={`group relative rounded-2xl border ${status.borderColor} ${status.bgColor} p-5 shadow-sm hover:shadow-md transition-all`}>
      {/* Tooltip */}
      <div className="absolute -top-9 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20 pointer-events-none">
        <div className="rounded-lg bg-gray-900 px-3 py-1.5 text-[11px] text-white whitespace-nowrap shadow-lg max-w-[250px] text-center">
          {tooltip}
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{emoji}</span>
          <span className="text-sm font-bold text-gray-700">{title}</span>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${status.color} ${status.bgColor} border ${status.borderColor}`}>
          {status.label}
        </span>
      </div>

      <div className="flex items-end gap-1.5 mb-2">
        <span className="text-2xl font-black text-gray-900">{value}</span>
        <span className="pb-0.5 text-xs font-medium text-gray-400">{unit}</span>
      </div>

      {progress !== undefined ? (
        <>
          <p className="mb-2 text-[10px] font-semibold text-gray-400">{target}</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/60">
            <div
              className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1.5 text-[10px] font-semibold text-gray-400">Đạt {progress}% mục tiêu</p>
        </>
      ) : (
        <p className="text-[10px] font-semibold text-gray-400">{target}</p>
      )}
    </div>
  );
}

/* ---- 4. CHARTS SECTION ---- */

function NutritionChartsSection({
  daily,
  targets,
}: {
  daily: DailyNutrition[];
  targets: MacroTargets;
}) {
  return (
    <section className="space-y-6">
      <SectionTitle
        icon={HiChartBar}
        title="Biểu đồ dinh dưỡng theo tuần"
        description="Các biểu đồ bên dưới là số liệu thực tế được tổng hợp từ thực đơn trong tuần."
      />

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Calories theo tuần"
          description="Theo dõi tổng năng lượng mỗi ngày và so sánh với mục tiêu calories cá nhân."
        >
          <WeeklyCaloriesChart daily={daily} calorieTarget={targets.calories} />
        </ChartCard>

        <ChartCard
          title="Protein theo tuần"
          description="Số gram protein được tổng hợp từ các món có trong thực đơn."
        >
          <NutrientByDayChart
            daily={daily}
            nutrient="protein"
            label="Protein"
            color="#10b981"
            targetLine={targets.protein}
            targetLabel={`Mục tiêu: ${targets.protein}g`}
          />
        </ChartCard>

        <ChartCard
          title="Carbs theo tuần"
          description="Số gram carbohydrate được tổng hợp từ các món có trong thực đơn."
        >
          <NutrientByDayChart
            daily={daily}
            nutrient="carbs"
            label="Carbs"
            color="#0ea5e9"
            targetLine={targets.carbs}
            targetLabel={`Mục tiêu: ${targets.carbs}g`}
          />
        </ChartCard>

        <ChartCard
          title="Fat theo tuần"
          description="Số gram chất béo được tổng hợp từ các món có trong thực đơn."
        >
          <NutrientByDayChart
            daily={daily}
            nutrient="fat"
            label="Fat"
            color="#8b5cf6"
            targetLine={targets.fat}
            targetLabel={`Mục tiêu: ${targets.fat}g`}
          />
        </ChartCard>
      </div>
    </section>
  );
}

function ChartCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-400 mt-1 leading-relaxed">{description}</p>
      </div>
      <div className="relative h-[300px] w-full">
        {children}
      </div>
    </div>
  );
}

/* ---- 6. NUTRITION TABLE ---- */

function NutritionTable({ data, targets }: { data: DailyNutrition[]; targets: MacroTargets }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 p-5 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Bảng chi tiết dinh dưỡng theo ngày</h3>
          <p className="mt-1 text-xs text-gray-400">
            {targets.calories > 0
              ? `Calories, Protein, Carbs, Fat được so sánh với mục tiêu tính từ TDEE (Calories: ${formatNumber(targets.calories)} kcal, Protein: ${targets.protein}g, Carbs: ${targets.carbs}g, Fat: ${targets.fat}g).`
              : 'Chưa có TDEE để so sánh chỉ số dinh dưỡng.'}
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              {['Ngày', 'Số món', 'Calories', 'Protein', 'Carbs', 'Fat', 'Nhận xét'].map((heading) => (
                <th
                  key={heading}
                  className="whitespace-nowrap px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {data.map((day) => {
              const dishes = Number(day.dishCount) || 0;
              const evaluation = getDetailedEvaluation(day, targets);
              const dateLabel = day.date
                ? new Date(day.date).toLocaleDateString('vi-VN', {
                    weekday: 'short',
                    day: '2-digit',
                    month: '2-digit',
                  })
                : day.label;

              return (
                <tr key={day.date || day.day} className={dishes === 0 ? 'bg-gray-50/50' : ''}>
                  <td className="whitespace-nowrap px-5 py-4 font-semibold text-gray-900">
                    {dateLabel}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4">
                    {dishes === 0 ? (
                      <span className="text-gray-400 italic text-xs">—</span>
                    ) : (
                      <span>{formatNumber(dishes)} món</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4">
                    {dishes === 0 ? <span className="text-gray-400 italic text-xs">—</span> : `${formatNumber(day.calories)} kcal`}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4">
                    {dishes === 0 ? <span className="text-gray-400 italic text-xs">—</span> : `${formatNumber(day.protein)} g`}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4">
                    {dishes === 0 ? <span className="text-gray-400 italic text-xs">—</span> : `${formatNumber(day.carbs)} g`}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4">
                    {dishes === 0 ? <span className="text-gray-400 italic text-xs">—</span> : `${formatNumber(day.fat)} g`}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4">
                    {dishes === 0 ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-500">
                        Chưa có thực đơn
                      </span>
                    ) : (
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${evaluation.className}`}>
                        {evaluation.label}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function getDetailedEvaluation(day: DailyNutrition, targets: MacroTargets) {
  const calories = Number(day.calories) || 0;
  const dishes = Number(day.dishCount) || 0;

  if (dishes === 0) {
    return { label: 'Chưa có thực đơn', className: 'bg-gray-100 text-gray-500' };
  }
  if (dishes <= 1) {
    return { label: 'Ít món', className: 'bg-amber-50 text-amber-700' };
  }

  const calRatio = targets.calories > 0 ? calories / targets.calories : 0;

  if (calRatio > 1.15) {
    return { label: 'Calories cao', className: 'bg-red-50 text-red-700' };
  }
  if (calRatio < 0.7 && calRatio > 0) {
    return { label: 'Thiếu năng lượng', className: 'bg-amber-50 text-amber-700' };
  }
  if (targets.calories <= 0) {
    return { label: 'Đã có dữ liệu', className: 'bg-sky-50 text-sky-700' };
  }
  return { label: 'Calories phù hợp', className: 'bg-emerald-50 text-emerald-700' };
}

/* ---- 7. AI INSIGHTS SECTION ---- */

function AIInsightsSection({
  analysis,
  analysisError,
  trendInsights,
  onRetry,
}: {
  analysis: AIAnalysis | null;
  analysisError: string | null;
  trendInsights: string[];
  onRetry: () => void;
}) {
  const strengths = analysis?.strengths ?? [];
  const warnings = analysis?.warnings ?? analysis?.weaknesses ?? [];
  const recommendations = analysis?.recommendations ?? [];

  return (
    <section className="space-y-6">
      <SectionTitle
        icon={HiSparkles}
        title="AI Insights — Phân tích chuyên sâu"
        description="Phân tích AI tập trung vào điểm mạnh, cảnh báo sức khỏe, xu hướng và đề xuất cải thiện."
      />

      {analysisError ? (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-6 text-center">
          <HiExclamationCircle className="mx-auto mb-3 h-10 w-10 text-amber-400" />
          <p className="text-sm text-amber-700 font-medium">{analysisError}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary-hover"
          >
            Thử lại
          </button>
        </div>
      ) : !analysis ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center shadow-sm">
          <HiSparkles className="mx-auto mb-4 h-14 w-14 text-gray-300" />
          <h2 className="text-xl font-bold text-gray-900">Chưa có đủ dữ liệu để phân tích AI Insights</h2>
          <p className="mx-auto mt-2 max-w-2xl text-gray-600">
            Chưa có đủ dữ liệu để phân tích AI Insights. Hãy tạo thực đơn hoặc cập nhật hồ sơ cá nhân.
          </p>
        </div>
      ) : (
        <>
          {(analysis.dataDays || 0) < 3 && (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm font-medium leading-6 text-sky-800">
              Dữ liệu tuần hiện tại chưa đầy đủ. Nhận xét chỉ mang tính tham khảo dựa trên {analysis.dataDays || 0} ngày đã có thực đơn.
            </div>
          )}

          {(analysis.incompleteNutritionCount || 0) > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium leading-6 text-amber-800">
              Một số món chưa có đầy đủ thông tin dinh dưỡng, kết quả phân tích có thể chưa chính xác.
            </div>
          )}

          <div className="rounded-2xl border border-brand-primary/15 bg-white p-6 shadow-sm">
            <p className="text-sm font-bold uppercase tracking-wide text-brand-primary">
              Nhận xét tổng quan
            </p>
            <p className="mt-3 leading-7 text-slate-700">
              {analysis.analysis ||
                'AI chưa trả về nhận xét tổng quan cho dữ liệu hiện tại. Hãy bổ sung thêm thực đơn hoặc cập nhật hồ sơ sức khỏe để có phân tích rõ hơn.'}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <InsightCard
              icon={HiCheckCircle}
              title="Điểm mạnh thực đơn"
              items={strengths}
              emptyText="Chưa đủ dữ liệu để xác định điểm mạnh."
              color="text-emerald-600"
              bg="bg-emerald-50"
            />
            <InsightCard
              icon={HiExclamationCircle}
              title="Cảnh báo sức khỏe"
              items={warnings}
              emptyText="Chưa có cảnh báo dựa trên dữ liệu dinh dưỡng hiện có."
              color="text-amber-600"
              bg="bg-amber-50"
            />
            <InsightCard
              icon={HiTrendingUp}
              title="Phân tích xu hướng ăn uống"
              items={trendInsights}
              emptyText="Chưa đủ dữ liệu để phân tích xu hướng."
              color="text-sky-600"
              bg="bg-sky-50"
            />
            <InsightCard
              icon={HiLightBulb}
              title="Đề xuất cải thiện và gợi ý món"
              items={recommendations}
              emptyText="Chưa có gợi ý món nên thêm hoặc nên giảm cho dữ liệu hiện tại."
              color="text-purple-600"
              bg="bg-purple-50"
            />
          </div>
        </>
      )}
    </section>
  );
}

/* ---- SHARED COMPONENTS ---- */

function LoadingPanel() {
  return (
    <section className="space-y-6">
      <div className="h-16 animate-pulse rounded-2xl bg-gray-100" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-36 animate-pulse rounded-2xl bg-gray-100" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-80 animate-pulse rounded-2xl bg-gray-100" />
        ))}
      </div>
    </section>
  );
}

function NutritionDataEmptyState() {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-10 text-center shadow-sm">
      <HiChartBar className="mx-auto mb-4 h-14 w-14 text-gray-300" />
      <h2 className="text-xl font-bold text-gray-900">Chưa có dữ liệu dinh dưỡng</h2>
      <p className="mx-auto mt-2 max-w-2xl text-gray-600">
        Trang này hiển thị số liệu thực tế từ Meal Planner. Hãy tạo thực đơn tuần để hệ thống tổng hợp calories, protein, carbs và fat.
      </p>
      <Link
        href="/meal-planner"
        className="mt-6 inline-flex rounded-xl bg-brand-primary px-5 py-3 font-semibold text-white hover:bg-brand-primary-hover"
      >
        Tạo thực đơn
      </Link>
    </section>
  );
}

function NutritionErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="rounded-2xl border border-red-100 bg-white p-10 text-center shadow-sm">
      <HiExclamationCircle className="mx-auto mb-4 h-14 w-14 text-red-400" />
      <h2 className="text-xl font-bold text-gray-900">Không thể đồng bộ dữ liệu</h2>
      <p className="mx-auto mt-2 max-w-2xl text-gray-600">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 inline-flex rounded-xl bg-brand-primary px-5 py-3 font-semibold text-white hover:bg-brand-primary-hover"
      >
        Thử lại
      </button>
    </section>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  description,
}: {
  icon: ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="rounded-2xl bg-brand-primary/10 p-3 text-brand-primary">
        <Icon className="h-7 w-7" />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
        <p className="mt-1 text-gray-600">{description}</p>
      </div>
    </div>
  );
}

function InsightCard({
  icon: Icon,
  title,
  items,
  emptyText,
  color,
  bg,
}: {
  icon: ElementType;
  title: string;
  items: string[];
  emptyText: string;
  color: string;
  bg: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className={`rounded-xl p-2 ${bg} ${color}`}>
          <Icon className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
      </div>
      {items.length > 0 ? (
        <ul className="space-y-3">
          {items.map((item, index) => (
            <li key={`${item}-${index}`} className="rounded-xl bg-gray-50 px-4 py-3 text-gray-700">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-gray-50 px-4 py-3 text-gray-500">{emptyText}</p>
      )}
    </div>
  );
}

/* ================================================================== */
/*                       DATA ANALYSIS FUNCTIONS                      */
/* ================================================================== */

function buildTrendInsights(
  daily: DailyNutrition[],
  calorieTarget: number,
) {
  const insights: string[] = [];
  const activeDays = daily.filter((d) => (Number(d.dishCount) || 0) > 0);
  const emptyDays = daily.length - activeDays.length;

  if (activeDays.length === 0) return insights;

  if (activeDays.length < 3) {
    insights.push('Dữ liệu còn ít, hệ thống chưa thể đánh giá toàn diện xu hướng dinh dưỡng trong tuần.');
  } else {
    const sortedByCalories = [...activeDays].sort(
      (left, right) => Number(right.calories) - Number(left.calories),
    );
    const highest = sortedByCalories[0];
    const lowest = sortedByCalories[sortedByCalories.length - 1];
    insights.push(
      `Calories tập trung cao nhất vào ${highest.label} (${formatNumber(highest.calories)} kcal) và thấp nhất vào ${lowest.label} (${formatNumber(lowest.calories)} kcal).`,
    );

    if (calorieTarget > 0) {
      const averageCalories =
        activeDays.reduce((sum, day) => sum + Number(day.calories), 0) /
        activeDays.length;
      if (averageCalories > calorieTarget * 1.15) {
        insights.push('Calories trung bình của các ngày có thực đơn đang vượt mục tiêu năng lượng theo hồ sơ sức khỏe.');
      } else if (averageCalories < calorieTarget * 0.7) {
        insights.push('Calories trung bình của các ngày có thực đơn đang thấp hơn nhiều so với mục tiêu năng lượng cá nhân.');
      }
    }
  }

  if (emptyDays > 0) {
    insights.push(`Có ${emptyDays} ngày còn lại chưa có thực đơn.`);
  }

  return insights;
}
