'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { recommendationAPI } from '@/lib/api';
import Link from 'next/link';
import {
  HiArrowLeft,
  HiCheckCircle,
  HiExclamationCircle,
  HiLightBulb,
  HiSparkles,
  HiTrendingUp,
  HiCurrencyDollar,
  HiCalendar,
  HiShieldCheck
} from 'react-icons/hi';

export default function AIInsightsPage() {
  const { user } = useAuth();
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState<string>('');

  // Get current Monday string (YYYY-MM-DD)
  const getMonday = (d: Date) => {
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    const year = monday.getFullYear();
    const month = String(monday.getMonth() + 1).padStart(2, '0');
    const date = String(monday.getDate()).padStart(2, '0');
    return `${year}-${month}-${date}`;
  };

  useEffect(() => {
    const todayStr = getMonday(new Date());
    setWeekStart(todayStr);
  }, []);

  useEffect(() => {
    if (user && weekStart) {
      loadAnalysis();
    } else if (!user) {
      setLoading(false);
    }
  }, [user, weekStart]);

  const loadAnalysis = async () => {
    setLoading(true);
    try {
      const res = await recommendationAPI.getNutritionAnalysis(weekStart);
      setAnalysis(res.data);
    } catch (err) {
      console.error('Failed to load AI insights:', err);
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-brand-success border-brand-success bg-brand-success/5';
    if (score >= 50) return 'text-brand-warning border-brand-warning bg-brand-warning/5';
    return 'text-brand-danger border-brand-danger bg-brand-danger/5';
  };

  const changeWeek = (offsetWeeks: number) => {
    const currentDate = new Date(weekStart);
    currentDate.setDate(currentDate.getDate() + offsetWeeks * 7);
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const date = String(currentDate.getDate()).padStart(2, '0');
    setWeekStart(`${year}-${month}-${date}`);
  };

  if (!user) {
    return (
      <div className="text-center py-20 bg-brand-light-bg min-h-screen flex flex-col justify-center items-center">
        <p className="text-5xl mb-4 animate-brand-float">🧠</p>
        <p className="text-slate-500">
          Vui lòng <Link href="/login" className="text-brand-primary font-bold underline hover:text-brand-primary-hover">đăng nhập</Link> để xem phân tích của AI.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-4 py-6 bg-brand-light-bg min-h-screen">
      {/* Back button & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link
            href="/meal-planner"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-primary mb-2 transition font-bold"
          >
            <HiArrowLeft /> Quay lại Thực đơn tuần
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <HiSparkles className="text-brand-primary animate-pulse" /> AI Insights Dashboard
          </h1>
          <p className="text-slate-500 text-xs mt-1 font-medium">
            Phân tích thói quen ăn uống, cảnh báo sức khỏe và đề xuất cải thiện thông minh từ AI.
          </p>
        </div>

        {/* Date Selector */}
        <div className="flex items-center gap-3 bg-white p-2 rounded-brand-md border border-brand-light-border shadow-brand-sm">
          <button
            onClick={() => changeWeek(-1)}
            className="p-2 hover:bg-slate-100 rounded-brand-sm text-slate-655 transition cursor-pointer font-bold"
            title="Tuần trước"
          >
            &larr;
          </button>
          <span className="text-sm font-bold text-slate-750 flex items-center gap-2">
            <HiCalendar className="text-slate-400 text-lg" />
            Tuần bắt đầu: {weekStart}
          </span>
          <button
            onClick={() => changeWeek(1)}
            className="p-2 hover:bg-slate-100 rounded-brand-sm text-slate-655 transition cursor-pointer font-bold"
            title="Tuần sau"
          >
            &rarr;
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
          <div className="md:col-span-1 bg-white h-80 rounded-brand-md border border-brand-light-border shadow-brand-sm" />
          <div className="md:col-span-2 space-y-6">
            <div className="bg-white h-44 rounded-brand-md border border-brand-light-border shadow-brand-sm" />
            <div className="bg-white h-44 rounded-brand-md border border-brand-light-border shadow-brand-sm" />
          </div>
        </div>
      ) : !analysis ? (
        <div className="card-dashboard bg-white p-16 text-center">
          <div className="w-16 h-16 bg-brand-primary/10 text-brand-primary rounded-brand-md flex items-center justify-center mx-auto mb-4 text-3xl font-bold">
            📊
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">Chưa tìm thấy phân tích cho tuần này</h3>
          <p className="text-slate-500 max-w-md mx-auto mb-6 font-medium text-sm">
            Hãy thiết kế thực đơn tuần của bạn đầy đủ để AI phân tích định lượng calo, chất xơ, và cân bằng macro.
          </p>
          <Link
            href="/meal-planner"
            className="btn-primary inline-block"
          >
            Đi tới Thiết kế Thực đơn
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1: AI Score Circular & Macro Metrics */}
          <div className="lg:col-span-1 space-y-6">
            {/* Score Card */}
            <div className="card-ai-insight bg-white p-8 text-center relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-brand-primary/5 rounded-full blur-2xl -mr-8 -mt-8" />
              <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-4">Điểm cân bằng AI</h3>
              
              <div className="relative inline-flex items-center justify-center mb-4">
                <div className={`w-32 h-32 rounded-full border-8 flex flex-col items-center justify-center transition-all ${getScoreColor(analysis.nutritionScore)}`}>
                  <span className="text-4xl font-extrabold">{analysis.nutritionScore}</span>
                  <span className="text-xs font-semibold opacity-70">/ 100</span>
                </div>
              </div>

              <div className="space-y-1">
                <p className="font-bold text-slate-800 text-lg">
                  {analysis.nutritionScore >= 80 ? 'Dinh dưỡng Tối ưu ✨' : analysis.nutritionScore >= 50 ? 'Dinh dưỡng Khá tốt 👍' : 'Cần cải thiện ⚠️'}
                </p>
                <p className="text-xs text-slate-400 font-medium">Được chấm điểm dựa trên phân bổ Macro & chất xơ</p>
              </div>
            </div>

            {/* Micro / Macro Summary */}
            <div className="card-dashboard bg-white p-6 space-y-4">
              <h3 className="text-slate-800 font-bold flex items-center gap-2 border-b pb-3 border-brand-light-border text-xs uppercase tracking-wider">
                <HiTrendingUp className="text-brand-primary text-lg" /> Thống kê dinh dưỡng tuần
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-brand-sm border border-brand-light-border shadow-brand-sm">
                  <span className="text-xs text-slate-550 block mb-1 font-bold">Tổng Calo tuần</span>
                  <span className="text-xl font-bold text-slate-900">{analysis.macroSummary.totalCalories}</span>
                  <span className="text-xs text-slate-500 ml-1 font-bold">kcal</span>
                </div>
                <div className="bg-slate-50 p-4 rounded-brand-sm border border-brand-light-border shadow-brand-sm">
                  <span className="text-xs text-slate-550 block mb-1 font-bold">Khẩu phần Rau xanh</span>
                  <span className="text-xl font-bold text-slate-900">{analysis.macroSummary.greensCount}</span>
                  <span className="text-xs text-slate-550 ml-1 font-bold font-bold">bữa</span>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div>
                  <div className="flex justify-between text-xs text-slate-600 font-bold mb-1">
                    <span>Đạm (Protein)</span>
                    <span className="font-extrabold text-slate-850">{analysis.macroSummary.proteinGrams}g</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-100">
                    <div className="bg-blue-500 h-full rounded-full" style={{ width: `${Math.min((analysis.macroSummary.proteinGrams / 500) * 100, 100)}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-600 font-bold mb-1">
                    <span>Tinh bột (Carbohydrate)</span>
                    <span className="font-extrabold text-slate-850">{analysis.macroSummary.carbsGrams}g</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-100">
                    <div className="bg-amber-500 h-full rounded-full" style={{ width: `${Math.min((analysis.macroSummary.carbsGrams / 1500) * 100, 100)}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-600 font-bold mb-1">
                    <span>Chất béo (Fat)</span>
                    <span className="font-extrabold text-slate-850">{analysis.macroSummary.fatGrams}g</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-100">
                    <div className="bg-red-500 h-full rounded-full" style={{ width: `${Math.min((analysis.macroSummary.fatGrams / 500) * 100, 100)}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Waste and Savings estimate */}
            <div className="card-ai-insight bg-emerald-50/20 border border-emerald-100/50 p-6 space-y-3">
              <h4 className="font-bold text-emerald-800 flex items-center gap-2 text-xs uppercase tracking-wider">
                <HiCurrencyDollar className="text-xl text-brand-primary" /> Tiết kiệm & Tận dụng Tủ lạnh
              </h4>
              <p className="text-xs text-emerald-700 leading-relaxed font-semibold">
                Nhờ sử dụng gợi ý chống lãng phí nguyên liệu trong tủ lạnh (Anti-waste matching), bạn đã tận dụng tối đa đồ ăn sẵn có.
              </p>
              <div className="bg-white rounded-brand-md p-4 text-center border border-emerald-100 shadow-brand-sm">
                <span className="text-xs text-emerald-650 block uppercase font-bold tracking-wide mb-1">Số tiền ước tính tiết kiệm</span>
                <span className="text-2xl font-extrabold text-emerald-700">
                  {Math.round((analysis.macroSummary.greensCount * 25000 + 150000) / 1000) * 1000}đ
                </span>
              </div>
            </div>
          </div>

          {/* Column 2 & 3: Strengths, Weaknesses, Warnings, Recommendations */}
          <div className="lg:col-span-2 space-y-6">
            {/* Strengths & Weaknesses Split Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Strengths Card */}
              <div className="card-dashboard bg-white p-6 space-y-4">
                <h3 className="font-bold flex items-center gap-2 border-b pb-3 border-brand-light-border text-brand-success text-xs uppercase tracking-wider">
                  <HiShieldCheck className="text-xl" /> Điểm mạnh thực đơn
                </h3>
                {analysis.strengths && analysis.strengths.length > 0 ? (
                  <ul className="space-y-3">
                    {analysis.strengths.map((str: string, idx: number) => (
                      <li key={idx} className="flex gap-2.5 items-start text-sm text-slate-655 font-bold">
                        <HiCheckCircle className="text-brand-success text-lg flex-shrink-0 mt-0.5" />
                        <span>{str}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-400 italic">Chưa ghi nhận điểm cộng dinh dưỡng nổi trội.</p>
                )}
              </div>

              {/* Weaknesses / Warnings Card */}
              <div className="card-dashboard bg-white p-6 space-y-4">
                <h3 className="font-bold flex items-center gap-2 border-b pb-3 border-brand-light-border text-brand-danger text-xs uppercase tracking-wider">
                  <HiExclamationCircle className="text-xl" /> Cảnh báo sức khỏe
                </h3>
                {analysis.weaknesses && analysis.weaknesses.length > 0 ? (
                  <ul className="space-y-3">
                    {analysis.weaknesses.map((weak: string, idx: number) => (
                      <li key={idx} className="flex gap-2.5 items-start text-sm text-slate-655 font-bold">
                        <HiExclamationCircle className="text-brand-danger text-lg flex-shrink-0 mt-0.5" />
                        <span>{weak}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex gap-2 items-center text-sm text-brand-success bg-brand-success/5 p-3 rounded-brand-sm border border-brand-success/15 font-bold">
                    <HiCheckCircle className="text-lg" />
                    <span>Không có cảnh báo sức khỏe tiêu cực nào tuần này!</span>
                  </div>
                )}
              </div>
            </div>

            {/* Recommendations Card */}
            <div className="card-ai-insight bg-white p-6 space-y-4">
              <h3 className="font-bold flex items-center gap-2 border-b pb-3 border-brand-light-border text-brand-warning text-xs uppercase tracking-wider">
                <HiLightBulb className="text-xl" /> Đề xuất cải thiện từ AI
              </h3>
              {analysis.recommendations && analysis.recommendations.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {analysis.recommendations.map((rec: string, idx: number) => (
                    <div key={idx} className="flex gap-3 bg-brand-warning/5 border border-brand-warning/10 p-4 rounded-brand-md items-start shadow-brand-sm">
                      <div className="w-8 h-8 bg-brand-warning/10 text-brand-warning rounded-brand-sm flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">
                        <HiLightBulb className="text-lg" />
                      </div>
                      <p className="text-sm text-slate-755 font-bold leading-relaxed">{rec}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400 italic">Thực đơn đã tối ưu, chưa cần đề xuất thêm cải tiến.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
