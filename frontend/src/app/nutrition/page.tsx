'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { mealPlanAPI } from '@/lib/api';
import { WeeklyCaloriesChart, MacroDistributionChart, DailyMacroChart } from '@/components/NutritionCharts';
import Link from 'next/link';
import { HiChartBar, HiArrowLeft, HiInformationCircle } from 'react-icons/hi';

export default function NutritionPage() {
  const { user } = useAuth();
  const [nutrition, setNutrition] = useState<any>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) loadPlanAndNutrition();
    else setLoading(false);
  }, [user]);

  const loadPlanAndNutrition = async () => {
    try {
      // First, get the current week's meal plan
      const planRes = await mealPlanAPI.get();
      if (planRes.data?.id) {
        setPlanId(planRes.data.id);
        // Then fetch nutrition breakdown
        const nutRes = await mealPlanAPI.getNutrition(planRes.data.id);
        setNutrition(nutRes.data);
      }
    } catch {
      console.error('Failed to load nutrition data');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="text-center py-20 bg-brand-light-bg min-h-screen flex flex-col justify-center items-center">
        <p className="text-5xl mb-4 animate-brand-float">📊</p>
        <p className="text-slate-500">
          Vui lòng <Link href="/login" className="text-brand-primary font-bold underline hover:text-brand-primary-hover">đăng nhập</Link> để xem phân tích dinh dưỡng.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto px-4 py-6 bg-brand-light-bg min-h-screen">
        <div className="bg-white rounded-brand-md border border-brand-light-border h-64 animate-pulse shadow-brand-sm" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-brand-md border border-brand-light-border h-64 animate-pulse shadow-brand-sm" />
          <div className="bg-white rounded-brand-md border border-brand-light-border h-64 animate-pulse shadow-brand-sm" />
        </div>
      </div>
    );
  }

  if (!nutrition || !planId) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto px-4 py-6 bg-brand-light-bg min-h-screen">
        <h1 className="text-2xl font-bold text-slate-900">Phân tích dinh dưỡng 📊</h1>
        <div className="card-dashboard bg-white p-16 text-center">
          <p className="text-5xl mb-4">📊</p>
          <h3 className="text-lg font-bold text-slate-900 mb-2">Chưa có dữ liệu</h3>
          <p className="text-slate-550 mb-6 font-medium text-sm">Hãy tạo thực đơn tuần trước để xem phân tích dinh dưỡng</p>
          <Link
            href="/meal-planner"
            className="btn-primary inline-block"
          >
            Tạo thực đơn
          </Link>
        </div>
      </div>
    );
  }

  const { daily, weeklyAvg, macroDistribution, calorieTarget } = nutrition;

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-4 py-6 bg-brand-light-bg min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href="/meal-planner" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-primary mb-2 font-bold">
            <HiArrowLeft /> Trở lại thực đơn
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <HiChartBar className="text-brand-primary" /> Phân tích dinh dưỡng tuần
          </h1>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard
          label="Avg Calories/ngày"
          value={`${weeklyAvg.calories}`}
          unit="kcal"
          target={calorieTarget}
          variant="calories"
        />
        <SummaryCard
          label="Protein"
          value={`${weeklyAvg.protein}`}
          unit={`g (${macroDistribution.proteinPercent}%)`}
          variant="protein"
        />
        <SummaryCard
          label="Carbs"
          value={`${weeklyAvg.carbs}`}
          unit={`g (${macroDistribution.carbsPercent}%)`}
          variant="carbs"
        />
        <SummaryCard
          label="Fat"
          value={`${weeklyAvg.fat}`}
          unit={`g (${macroDistribution.fatPercent}%)`}
          variant="fat"
        />
      </div>

      {/* Target comparison alert */}
      {calorieTarget && calorieTarget > 0 ? (
        <div className={`rounded-brand-md p-4 flex items-start gap-3 border shadow-brand-sm ${
          Math.abs(weeklyAvg.calories - calorieTarget) / calorieTarget < 0.1
            ? 'bg-brand-success/5 border-brand-success/20'
            : weeklyAvg.calories > calorieTarget
            ? 'bg-brand-danger/5 border-brand-danger/20'
            : 'bg-brand-warning/5 border-brand-warning/20'
        }`}>
          <HiInformationCircle className={`text-xl mt-0.5 flex-shrink-0 ${
            Math.abs(weeklyAvg.calories - calorieTarget) / calorieTarget < 0.1
              ? 'text-brand-success' : weeklyAvg.calories > calorieTarget ? 'text-brand-danger' : 'text-brand-warning'
          }`} />
          <div className="text-sm font-bold">
            <p className="text-slate-800">
              {Math.abs(weeklyAvg.calories - calorieTarget) / calorieTarget < 0.1
                ? '✅ Calories phù hợp với mục tiêu!'
                : weeklyAvg.calories > calorieTarget
                ? `⚠️ Vượt mục tiêu ${weeklyAvg.calories - calorieTarget} kcal/ngày`
                : `⚠️ Thiếu ${calorieTarget - weeklyAvg.calories} kcal/ngày so với mục tiêu`
              }
            </p>
            <p className="text-slate-450 mt-1 font-medium text-xs">
              Mục tiêu: {calorieTarget} kcal/ngày — Thực tế: {weeklyAvg.calories} kcal/ngày
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-brand-warning/5 border border-brand-warning/20 rounded-brand-md p-4 flex items-start gap-3 shadow-brand-sm">
          <HiInformationCircle className="text-xl mt-0.5 text-brand-warning flex-shrink-0 font-bold" />
          <div className="text-sm text-brand-warning font-bold">
            <p>⚠️ Chưa thiết lập mục tiêu calo thực tế</p>
            <p className="mt-1 font-medium text-xs text-slate-500">
              Vui lòng cập nhật đầy đủ thông tin cơ bản (Giới tính, Ngày sinh, Chiều cao, Cân nặng) tại{' '}
              <Link href="/profile" className="underline font-bold hover:text-brand-primary">
                Hồ sơ cá nhân
              </Link>{' '}
              để hệ thống tính toán mục tiêu calories chính xác và so sánh với thực tế.
            </p>
          </div>
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bar Chart — Weekly Calories (spans 2 cols) */}
        <div className="lg:col-span-2 card-dashboard bg-white p-6">
          <h2 className="font-bold text-slate-900 mb-2 text-base">📊 Calories theo ngày</h2>
          <p className="text-xs text-slate-400 mb-4 font-semibold">
            🟢 Đạt mục tiêu &nbsp; 🟡 Dưới 80% &nbsp; 🔴 Vượt 110%
          </p>
          <div className="h-72">
            <WeeklyCaloriesChart daily={daily} calorieTarget={calorieTarget} />
          </div>
        </div>

        {/* Pie Chart — Macro Distribution */}
        <div className="card-dashboard bg-white p-6">
          <h2 className="font-bold text-slate-900 mb-2 text-base">🥧 Tỷ lệ dinh dưỡng</h2>
          <p className="text-xs text-slate-400 mb-4 font-semibold">
            Khuyến nghị: Protein 15-25%, Carbs 45-65%, Fat 20-35%
          </p>
          <div className="h-64">
            <MacroDistributionChart
              protein={weeklyAvg.protein}
              carbs={weeklyAvg.carbs}
              fat={weeklyAvg.fat}
            />
          </div>
        </div>
      </div>

      {/* Stacked Bar — Daily Macro Breakdown */}
      <div className="card-dashboard bg-white p-6">
        <h2 className="font-bold text-slate-900 mb-2 text-base">📈 Chi tiết dinh dưỡng theo ngày</h2>
        <p className="text-xs text-slate-450 mb-4 font-semibold">
          Protein, Carbs, Fat (gram) — Xếp chồng theo ngày trong tuần
        </p>
        <div className="h-72">
          <DailyMacroChart daily={daily} />
        </div>
      </div>

      {/* Daily Breakdown Table */}
      <div className="card-dashboard bg-white overflow-hidden !p-0">
        <div className="p-5 border-b border-brand-light-border">
          <h2 className="font-bold text-slate-900 text-base">📋 Bảng chi tiết</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-5 py-3 text-slate-500 font-bold uppercase tracking-wider text-[11px]">Ngày</th>
                <th className="text-right px-5 py-3 text-slate-500 font-bold uppercase tracking-wider text-[11px]">Calories</th>
                <th className="text-right px-5 py-3 text-slate-500 font-bold uppercase tracking-wider text-[11px]">Protein</th>
                <th className="text-right px-5 py-3 text-slate-500 font-bold uppercase tracking-wider text-[11px]">Carbs</th>
                <th className="text-right px-5 py-3 text-slate-500 font-bold uppercase tracking-wider text-[11px]">Fat</th>
                <th className="text-right px-5 py-3 text-slate-500 font-bold uppercase tracking-wider text-[11px]">Đánh giá</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-light-border">
              {daily.map((d: any) => {
                const deviation = calorieTarget
                  ? Math.abs(d.calories - calorieTarget) / calorieTarget
                  : 0;
                return (
                  <tr key={d.day} className="hover:bg-slate-50 transition-colors font-bold text-slate-700">
                    <td className="px-5 py-3.5 text-slate-900 font-extrabold">{d.label}</td>
                    <td className="px-5 py-3.5 text-right text-slate-800">{d.calories} kcal</td>
                    <td className="px-5 py-3.5 text-right text-blue-600">{d.protein}g</td>
                    <td className="px-5 py-3.5 text-right text-amber-600">{d.carbs}g</td>
                    <td className="px-5 py-3.5 text-right text-rose-600">{d.fat}g</td>
                    <td className="px-5 py-3.5 text-right text-xs">
                      {deviation < 0.1 ? (
                        <span className="px-2 py-0.5 rounded bg-brand-success/10 text-brand-success font-extrabold border border-brand-success/10">✅ Tốt</span>
                      ) : d.calories > (calorieTarget || 0) ? (
                        <span className="px-2 py-0.5 rounded bg-brand-danger/10 text-brand-danger font-extrabold border border-brand-danger/10">▲ Cao</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-brand-warning/10 text-brand-warning font-extrabold border border-brand-warning/10">▼ Thấp</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-emerald-50/40 border-t border-brand-light-border font-extrabold">
              <tr>
                <td className="px-5 py-3.5 text-slate-900">Trung bình</td>
                <td className="px-5 py-3.5 text-right text-brand-primary">{weeklyAvg.calories} kcal</td>
                <td className="px-5 py-3.5 text-right text-blue-600">{weeklyAvg.protein}g</td>
                <td className="px-5 py-3.5 text-right text-amber-600">{weeklyAvg.carbs}g</td>
                <td className="px-5 py-3.5 text-right text-rose-600">{weeklyAvg.fat}g</td>
                <td className="px-5 py-3.5" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==================== Summary Card Component ====================

function SummaryCard({
  label, value, unit, target, variant,
}: {
  label: string; value: string; unit: string; target?: number; variant: 'calories' | 'protein' | 'carbs' | 'fat';
}) {
  if (variant === 'calories') {
    return (
      <div className="bg-gradient-to-br from-brand-primary to-brand-primary-hover rounded-brand-md p-5 text-white shadow-brand-glow hover:shadow-brand-lg transition-all hover:scale-[1.02] cursor-default text-left relative overflow-hidden">
        <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full blur-xl -mr-4 -mt-4 pointer-events-none" />
        <p className="text-xs text-white/80 font-bold uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-extrabold mt-1">{value}</p>
        <p className="text-xs text-white/75 mt-1 font-semibold">{unit}</p>
        {target && target > 0 ? (
          <p className="text-xs text-white/60 mt-1 font-semibold">Mục tiêu: {target} kcal</p>
        ) : null}
      </div>
    );
  }
  
  if (variant === 'protein') {
    return (
      <div className="bg-gradient-to-br from-brand-secondary to-teal-600 rounded-brand-md p-5 text-white shadow-brand-glow hover:shadow-brand-lg transition-all hover:scale-[1.02] cursor-default text-left relative overflow-hidden">
        <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full blur-xl -mr-4 -mt-4 pointer-events-none" />
        <p className="text-xs text-white/80 font-bold uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-extrabold mt-1">{value}</p>
        <p className="text-xs text-white/75 mt-1 font-semibold">{unit}</p>
      </div>
    );
  }

  if (variant === 'carbs') {
    return (
      <div className="card-ai-health-score bg-emerald-50/40 border-brand-primary/10 hover:border-brand-primary hover:shadow-brand-glow text-left p-5 transition-all cursor-default">
        <p className="text-xs text-brand-primary font-extrabold uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-extrabold mt-1 text-slate-900">{value}</p>
        <p className="text-xs text-slate-500 mt-1 font-semibold">{unit}</p>
      </div>
    );
  }

  // Variant fat: Slate + Accent (Amber/warning border/accent)
  return (
    <div className="card-ai-warning bg-slate-50/50 hover:border-brand-warning hover:shadow-brand-glow text-left p-5 transition-all cursor-default relative overflow-hidden">
      <div className="absolute top-0 right-0 w-2 h-full bg-brand-warning"></div>
      <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-extrabold mt-1 text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 mt-1 font-semibold">{unit}</p>
    </div>
  );
}
