'use client';
import { useEffect, useState, useRef } from 'react';
import { useInView } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { recommendationAPI, mealPlanAPI, inventoryAPI } from '@/lib/api';
import { MEAL_PLAN_UPDATED_EVENT } from '@/lib/mealPlanEvents';
import Link from 'next/link';
import toast from 'react-hot-toast';
import ScrollReveal from '@/components/animations/ScrollReveal';
import StaggerContainer from '@/components/animations/StaggerContainer';
import FadeInUp from '@/components/animations/FadeInUp';
import AnimatedCounter from '@/components/animations/AnimatedCounter';
import {
  HiSparkles, HiLightningBolt, HiClock, HiFire,
  HiShieldExclamation, HiArrowRight, HiCalendar, HiShoppingCart,
  HiX, HiCheckCircle, HiStar, HiCube, HiEye, HiUserGroup,
  HiHeart, HiChevronRight, HiCheck, HiOutlineChatAlt, HiUser,
  HiPlus, HiFolderOpen
} from 'react-icons/hi';
import {
  LuChefHat,
  LuCalendarDays,
  LuRefrigerator,
  LuShoppingBasket,
  LuBrainCircuit,
  LuApple
} from 'react-icons/lu';

type RecommendationItem = {
  recipe: any;
  score: {
    total: number;
    nutritionScore: number;
    ingredientMatch: number;
    wasteReduction: number;
    preferenceMatch: number;
    cookTimeScore: number;
  };
  reasons?: string[];
  matchedInventory?: any[];
  missingIngredients?: any[];
};

type DashboardInsightItem = {
  label: string;
  message: string;
  tone: 'emerald' | 'amber' | 'teal' | 'rose';
};

const formatDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getTodayDateString = () => formatDateInputValue(new Date());

const getCurrentWeekStart = () => {
  const date = new Date();
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return formatDateInputValue(date);
};

function isPastDate(dateString: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const mealDate = new Date(dateString);
  mealDate.setHours(0, 0, 0, 0);

  return mealDate < today;
}

function isToday(dateString: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const mealDate = new Date(dateString);
  mealDate.setHours(0, 0, 0, 0);

  return mealDate.getTime() === today.getTime();
}

function isPastMealSlot(dateString: string, mealType: string) {
  if (isPastDate(dateString)) return true;
  if (!isToday(dateString)) return false;

  const hour = new Date().getHours();
  if (mealType === 'breakfast') return hour >= 10;
  if (mealType === 'lunch') return hour >= 14;
  if (mealType === 'dinner') return hour >= 21;

  return false;
}

const EMPTY_RECOMMENDATION_MESSAGE = 'Không tìm thấy món ăn phù hợp với nhu cầu hiện tại.';

const toNumber = (value: any, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeScore = (score: any = {}) => ({
  total: toNumber(score.total),
  nutritionScore: toNumber(score.nutritionScore),
  ingredientMatch: toNumber(score.ingredientMatch),
  wasteReduction: toNumber(score.wasteReduction),
  preferenceMatch: toNumber(score.preferenceMatch),
  cookTimeScore: toNumber(score.cookTimeScore),
});

const normalizeRecommendationResponse = (payload: any): RecommendationItem[] => {
  const source =
    Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.recommendations)
        ? payload.recommendations
        : Array.isArray(payload?.data?.recommendations)
          ? payload.data.recommendations
          : Array.isArray(payload?.data)
            ? payload.data
            : [];

  return source
    .map((item: any) => {
      const recipe = item?.recipe || item;
      if (!recipe || !recipe.id) return null;

      return {
        ...item,
        recipe: {
          ...recipe,
          calories: toNumber(recipe.calories),
          protein: toNumber(recipe.protein),
          carbs: toNumber(recipe.carbs),
          fat: toNumber(recipe.fat),
        },
        score: normalizeScore(item?.score),
        reasons: Array.isArray(item?.reasons) ? item.reasons : [],
        matchedInventory: Array.isArray(item?.matchedInventory) ? item.matchedInventory : [],
        missingIngredients: Array.isArray(item?.missingIngredients) ? item.missingIngredients : [],
      };
    })
    .filter(Boolean) as RecommendationItem[];
};

const getRecommendationScorePercent = (rec: RecommendationItem) => {
  const total = toNumber(rec.score?.total);
  return total <= 1 ? Math.round(total * 100) : Math.round(total);
};

const buildDashboardInsights = ({
  todayMeals,
  caloriesConsumed,
  calorieTarget,
  macros,
  pastMealCount,
  inventoryStats,
  inventoryItems,
  nutritionAnalysis,
}: {
  todayMeals: any[];
  caloriesConsumed: number;
  calorieTarget: number;
  macros: { protein: number; carbs: number; fat: number };
  pastMealCount: number;
  inventoryStats: { total: number; expiring: number; expired: number };
  inventoryItems: any[];
  nutritionAnalysis: any;
}): DashboardInsightItem[] => {
  const insights: DashboardInsightItem[] = [];

  if (todayMeals.length === 0 && inventoryStats.total === 0) return insights;

  if (pastMealCount > 0) {
    if (calorieTarget > 0 && caloriesConsumed > calorieTarget) {
      insights.push({
        label: 'Cảnh báo calo',
        tone: 'rose',
        message: `Đã tự động tính ${caloriesConsumed} kcal từ ${pastMealCount} món đã qua, vượt mục tiêu ${calorieTarget} kcal hôm nay. Nên chọn bữa còn lại nhẹ hơn.`,
      });
    } else if (calorieTarget > 0) {
      insights.push({
        label: 'Calo hôm nay',
        tone: 'emerald',
        message: `Đã tự động tính calories từ ${pastMealCount}/${todayMeals.length} món thuộc các bữa đã qua: ${caloriesConsumed}/${calorieTarget} kcal.`,
      });
    } else {
      insights.push({
        label: 'Calo hôm nay',
        tone: 'amber',
        message: `Đã ghi nhận ${caloriesConsumed} kcal từ ${pastMealCount} món đã qua. Hãy cập nhật hồ sơ cơ thể để hệ thống tính TDEE và so sánh chính xác.`,
      });
    }

    insights.push({
      label: 'Dữ liệu dinh dưỡng',
      tone: 'teal',
      message: `Macro đã ghi nhận: ${macros.protein}g protein, ${macros.carbs}g carbs và ${macros.fat}g chất béo. Hệ thống chưa kết luận đủ hoặc thiếu khi chưa có mục tiêu macro riêng.`,
    });
  }

  if (inventoryStats.expiring > 0) {
    const expiringNames = inventoryItems
      .filter((item: any) => item.status === 'near_expiry')
      .slice(0, 3)
      .map((item: any) => item.ingredient?.name || item.name)
      .filter(Boolean);

    insights.push({
      label: 'Tủ lạnh',
      tone: 'amber',
      message: expiringNames.length > 0
        ? `Có ${inventoryStats.expiring} nguyên liệu sắp hết hạn, gồm ${expiringNames.join(', ')}. MealAI sẽ ưu tiên gợi ý món dùng các nguyên liệu này trước.`
        : `Có ${inventoryStats.expiring} nguyên liệu sắp hết hạn. MealAI sẽ ưu tiên gợi ý món dùng các nguyên liệu này trước.`,
    });
  }

  if (inventoryStats.expired > 0) {
    insights.push({
      label: 'Nguyên liệu hết hạn',
      tone: 'rose',
      message: `Có ${inventoryStats.expired} nguyên liệu đã hết hạn. Các nguyên liệu này không nên được dùng để trừ danh sách mua sắm.`,
    });
  }

  const analysisSummary =
    nutritionAnalysis?.analysis ||
    nutritionAnalysis?.summary ||
    nutritionAnalysis?.recommendations?.[0] ||
    nutritionAnalysis?.data?.analysis;

  if (analysisSummary && insights.length < 3) {
    insights.push({
      label: 'Phân tích AI',
      tone: 'teal',
      message: String(analysisSummary),
    });
  }

  return insights.slice(0, 3);
};

function TodayMealsGroups({
  todayMeals,
  getMealTypeLabel,
}: {
  todayMeals: any[];
  getMealTypeLabel: (type: string) => string;
}) {
  return (
    <div className="space-y-5">
      {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((mealType) => {
        const items = todayMeals.filter((item: any) => item.mealType === mealType);
        if (items.length === 0) return null;

        const allPast = items.every((item: any) => isPastMealSlot(item.mealDate, item.mealType));

        return (
          <div key={mealType} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex rounded-full bg-brand-primary/10 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-brand-primary">
                {getMealTypeLabel(mealType)}
              </span>
              <span className="text-xs font-semibold text-slate-400">{items.length} món</span>
              {allPast ? (
                <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Đã qua
                </span>
              ) : (
                <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                  Chưa tới giờ
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {items.map((item: any) => {
                const isPastSlot = isPastMealSlot(item.mealDate, item.mealType);
                const recipeUrl = item.recipe?.id ? `/recipes/${item.recipe.id}` : undefined;

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (recipeUrl) window.location.href = recipeUrl;
                    }}
                    className={`card-recipe flex min-h-[160px] flex-col justify-between p-4 transition-all ${
                      isPastSlot
                        ? 'border-brand-primary/40 bg-emerald-50/20 shadow-brand-glow'
                        : 'border-brand-light-border bg-brand-light-card hover:border-brand-primary/40'
                    } ${recipeUrl ? 'cursor-pointer' : ''}`}
                  >
                    <div className="space-y-1.5 text-left">
                      <div className="flex items-center justify-between">
                        <span className="rounded-brand-sm bg-brand-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-primary">
                          {getMealTypeLabel(item.mealType)}
                        </span>
                        {isPastSlot ? (
                          <span className="rounded-brand-sm bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                            Đã qua
                          </span>
                        ) : (
                          <span className="rounded-brand-sm bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                            Chưa tới giờ
                          </span>
                        )}
                      </div>

                      <h4 className="line-clamp-1 text-sm font-bold text-gray-950 group-hover:text-emerald-700">
                        {recipeUrl ? (
                          <Link href={recipeUrl} onClick={(e) => e.stopPropagation()}>
                            {item.recipe?.name}
                          </Link>
                        ) : (
                          item.recipe?.name
                        )}
                      </h4>

                      <div className="flex gap-3 text-[10px] font-medium text-gray-500">
                        <span>🔥 {item.recipe?.calories} kcal</span>
                        <span>⏱️ {item.recipe?.cookingTime}p</span>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center justify-between border-t border-gray-100 pt-2">
                      <span className={`text-[10px] font-extrabold ${isPastSlot ? 'text-brand-primary' : 'text-slate-400'}`}>
                        {isPastSlot ? '✓ Đã tính calo' : '○ Chưa tới giờ'}
                      </span>
                      {recipeUrl && (
                        <Link
                          href={recipeUrl}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[10px] font-extrabold text-brand-primary hover:text-brand-primary-hover hover:underline"
                        >
                          Xem chi tiết
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const [selectedRecForExplanation, setSelectedRecForExplanation] = useState<any>(null);

  // Chat Demo Refs & State
  const chatSectionRef = useRef<HTMLDivElement>(null);
  const chatInView = useInView(chatSectionRef, { once: true, amount: 0.2 });
  const [activeChatTab, setActiveChatTab] = useState<'ingredients' | 'planner'>('ingredients');
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [isTyping, setIsTyping] = useState(false);

  // Authenticated Dashboard states
  const [mealPlan, setMealPlan] = useState<any>(null);
  const [inventoryStats, setInventoryStats] = useState({ total: 0, expiring: 0, expired: 0 });
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [nutritionAnalysis, setNutritionAnalysis] = useState<any>(null);
  const [consumedMeals, setConsumedMeals] = useState<Record<string, boolean>>({});
  const [dashboardLoading, setDashboardLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRecommendationLoading(false);
      return;
    }
    loadData();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const syncDashboard = () => {
      loadData();
    };

    window.addEventListener(MEAL_PLAN_UPDATED_EVENT, syncDashboard);
    window.addEventListener('inventory-updated', syncDashboard);

    return () => {
      window.removeEventListener(MEAL_PLAN_UPDATED_EVENT, syncDashboard);
      window.removeEventListener('inventory-updated', syncDashboard);
    };
  }, [user]);

  // Handle Tab switches & viewport trigger in Chat Demo
  useEffect(() => {
    if (user || !chatInView) return;

    let t1: any;
    let t2: any;

    setIsTyping(false);
    setChatMessages([]);

    if (activeChatTab === 'ingredients') {
      t1 = setTimeout(() => {
        setChatMessages([
          { sender: 'user', text: 'Tôi còn 2 quả trứng, 3 quả cà chua và ít hành lá trong tủ lạnh. AI gợi ý món gì nhanh gọn?' }
        ]);
        setIsTyping(true);

        t2 = setTimeout(() => {
          setChatMessages(prev => [
            ...prev,
            {
              sender: 'ai',
              text: 'Chào bạn! MealAI đã tìm thấy 2 món ăn Việt Nam cực kỳ ngon miệng và phù hợp với nguyên liệu sắp hết hạn của bạn:',
              recipes: [
                { name: 'Canh cà chua trứng', time: 15, cal: 120, difficulty: 'Dễ', matched: 'Trứng, cà chua, hành lá' },
                { name: 'Trứng chiên hành lá', time: 10, cal: 150, difficulty: 'Dễ', matched: 'Trứng, hành lá' }
              ]
            }
          ]);
          setIsTyping(false);
        }, 1500);
      }, 500);
    } else {
      t1 = setTimeout(() => {
        setChatMessages([
          { sender: 'user', text: 'AI lập thực đơn 3 ngày giảm mỡ cho 2 người, ưu tiên ăn sáng nhiều đạm.' }
        ]);
        setIsTyping(true);

        t2 = setTimeout(() => {
          setChatMessages(prev => [
            ...prev,
            {
              sender: 'ai',
              text: 'Dưới đây là kế hoạch bữa ăn 3 ngày (tối đa 1800 kcal/ngày) được thiết kế riêng cho bạn:',
              planner: [
                { day: 'Ngày 1', breakfast: 'Phở ức gà (nhiều đạm)', lunch: 'Cơm gạo lứt thịt heo luộc + bông cải xanh', dinner: 'Canh chua cá lóc' },
                { day: 'Ngày 2', breakfast: 'Omelet 3 lòng trắng trứng + bánh mì đen', lunch: 'Cá hồi áp chảo + măng tây xào', dinner: 'Thịt bò xào giá hẹ' },
                { day: 'Ngày 3', breakfast: 'Cháo yến mạch ức gà xé', lunch: 'Bún chả nướng chảo lòng heo nạc', dinner: 'Canh đậu hũ cà chua trứng' }
              ]
            }
          ]);
          setIsTyping(false);
        }, 1500);
      }, 500);
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [user, chatInView, activeChatTab]);

  const loadData = async () => {
    setDashboardLoading(true);
    setRecommendationLoading(true);
    setRecommendationError(null);
    try {
      const [recRes, planRes, invRes] = await Promise.all([
        recommendationAPI.get({ mealType: 'lunch', limit: 4 }).catch((error) => ({ data: null, error })),
        mealPlanAPI.get().catch(() => ({ data: null })), // handle empty plan gracefully
        inventoryAPI.getAll().catch(() => ({ data: { data: [] } })),
      ]);

      if ((recRes as any).error) {
        console.error('[MealAI][recommendations] API error:', (recRes as any).error);
        setRecommendationError('Không thể tải gợi ý món ăn. Vui lòng thử lại sau.');
        setRecommendations([]);
      } else {
        console.log('[MealAI][recommendations] raw response:', recRes.data);
        const normalizedRecommendations = normalizeRecommendationResponse(recRes.data);
        console.log('[MealAI][recommendations] normalized:', normalizedRecommendations);
        setRecommendations(normalizedRecommendations);
      }

      const plan = planRes?.data;
      setMealPlan(plan);

      // Populate consumed meals state
      if (plan && plan.items) {
        const todayDateString = getTodayDateString();
        const todayItems = plan.items.filter((item: any) => item.mealDate === todayDateString);
        const initialConsumed: Record<string, boolean> = {};

        todayItems.forEach((item: any) => {
          initialConsumed[item.id] = !!item.isConsumed;
        });
        setConsumedMeals(initialConsumed);
      } else {
        setConsumedMeals({});
      }

      // Populate inventory stats
      const inventoryList = Array.isArray(invRes?.data?.data) ? invRes.data.data : [];
      const inventorySummary = invRes?.data?.summary || {};
      const totalInv = inventorySummary.total ?? invRes?.data?.meta?.total ?? inventoryList.length;
      const expiringCount =
        inventorySummary.nearExpiry ??
        inventoryList.filter((item: any) => item.status === 'near_expiry').length;
      const expiredCount =
        inventorySummary.expired ??
        inventoryList.filter((item: any) => item.status === 'expired').length;
      setInventoryItems(inventoryList);
      setInventoryStats({ total: totalInv, expiring: expiringCount, expired: expiredCount });

      try {
        const analysisRes = await recommendationAPI.getNutritionAnalysis(getCurrentWeekStart());
        setNutritionAnalysis(analysisRes.data);
      } catch (analysisError) {
        console.error('[MealAI][dashboard] nutrition analysis failed:', analysisError);
        setNutritionAnalysis(null);
      }

    } catch (err) {
      console.error('[MealAI][dashboard] load failed:', err);
      setRecommendationError('Không thể tải gợi ý món ăn. Vui lòng thử lại sau.');
      setRecommendations([]);
    } finally {
      setDashboardLoading(false);
      setRecommendationLoading(false);
    }
  };

  // Helper getters for Authenticated Dashboard
  const getTodayMeals = () => {
    if (!mealPlan || !mealPlan.items) return [];
    const todayDateString = getTodayDateString();
    const mealTypeOrder: Record<string, number> = {
      breakfast: 0,
      lunch: 1,
      dinner: 2,
      snack: 3,
    };

    return mealPlan.items
      .filter((item: any) => item.mealDate === todayDateString)
      .sort((a: any, b: any) => {
        const mealTypeDiff = (mealTypeOrder[a.mealType] ?? 99) - (mealTypeOrder[b.mealType] ?? 99);
        if (mealTypeDiff !== 0) return mealTypeDiff;

        return (a.createdAt || '').localeCompare(b.createdAt || '');
      });
  };

  const getCaloriesConsumed = () => {
    const todayMeals = getTodayMeals();
    let total = 0;
    todayMeals.forEach((item: any) => {
      if (isPastMealSlot(item.mealDate, item.mealType)) {
        total += item.recipe?.calories || 0;
      }
    });
    return total;
  };

  const getNextMealLabel = () => {
    const hour = new Date().getHours();
    if (hour < 10) return 'Bữa sáng 🌅';
    if (hour < 14) return 'Bữa trưa ☀️';
    if (hour < 19) return 'Bữa tối 🌙';
    return 'Bữa sáng ngày mai 🌅';
  };

  const getTodayMacroNutrients = () => {
    const todayMeals = getTodayMeals();
    let p = 0, c = 0, f = 0;
    todayMeals.forEach((item: any) => {
      if (!isPastMealSlot(item.mealDate, item.mealType)) return;
      const rec = item.recipe;
      if (rec) {
        p += Number(rec.protein) || 0;
        c += Number(rec.carbs) || 0;
        f += Number(rec.fat) || 0;
      }
    });
    return {
      protein: Math.round(p),
      carbs: Math.round(c),
      fat: Math.round(f)
    };
  };

  const getMealTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      breakfast: 'Bữa sáng',
      lunch: 'Bữa trưa',
      dinner: 'Bữa tối',
      snack: 'Bữa phụ'
    };
    return labels[type] || type;
  };

  // ==================== 1. LANDING PAGE VIEW (Not Logged In) ====================
  if (!user) {
    return (
      <div className="bg-brand-light-bg text-slate-800 min-h-screen font-sans selection:bg-emerald-500 selection:text-white overflow-hidden relative">

        {/* Custom CSS Animation Keyframes */}
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes float {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-12px) rotate(0.5deg); }
          }
          @keyframes float-slow {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-8px) rotate(-0.5deg); }
          }
          @keyframes glow {
            0%, 100% { opacity: 0.1; filter: blur(80px); }
            50% { opacity: 0.2; filter: blur(100px); }
          }
          .animate-float {
            animation: float 6s ease-in-out infinite;
          }
          .animate-float-slow {
            animation: float-slow 8s ease-in-out infinite;
          }
          .animate-glow {
            animation: glow 8s ease-in-out infinite;
          }
          .bg-glow-emerald {
            background: radial-gradient(circle, rgba(16, 185, 129, 0.12) 0%, transparent 70%);
          }
          .bg-glow-teal {
            background: radial-gradient(circle, rgba(20, 184, 166, 0.1) 0%, transparent 70%);
          }
          .glassmorphism {
            background: rgba(255, 255, 255, 0.8);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(16, 185, 129, 0.12);
            box-shadow: 0 8px 32px 0 rgba(16, 185, 129, 0.05);
          }
          .glass-card-hover:hover {
            border-color: rgba(16, 185, 129, 0.3);
            box-shadow: 0 0 20px rgba(16, 185, 129, 0.15);
          }
        `}} />

        {/* Decorative Glowing Mesh Orbs */}
        <div className="absolute top-10 left-1/4 w-[500px] h-[500px] bg-glow-emerald rounded-full animate-glow z-0 pointer-events-none"></div>
        <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] bg-glow-teal rounded-full animate-glow z-0 pointer-events-none" style={{ animationDelay: '3s' }}></div>
        <div className="absolute bottom-10 left-10 w-[400px] h-[400px] bg-glow-emerald rounded-full animate-glow z-0 pointer-events-none" style={{ animationDelay: '5s' }}></div>

        {/* -------------------- HERO SECTION -------------------- */}
        <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-16 pb-20 lg:pt-24 lg:pb-32 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center bg-gradient-to-br from-emerald-50/70 via-teal-50/50 to-emerald-50/20 rounded-3xl border border-brand-primary/10 mt-6 shadow-brand-sm">

          {/* Left Hero Content */}
          <ScrollReveal className="lg:col-span-7 space-y-6 text-left">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-xs font-semibold tracking-wide uppercase shadow-sm">
              <HiSparkles className="text-sm animate-pulse" /> Trợ lý dinh dưỡng AI thế hệ mới
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.15]">
              Meal<span className="text-ai-gradient">AI</span> — Lập thực đơn thông minh cho gia đình Việt
            </h1>

            <p className="text-base sm:text-lg text-slate-650 max-w-2xl leading-relaxed">
              Giải phóng bản thân khỏi câu hỏi "Hôm nay ăn gì?". Trí tuệ nhân tạo Gemini phân tích tủ lạnh, tối ưu hóa calories, lên thực đơn tuần tự động và hạn chế tối đa lãng phí thực phẩm cho gia đình bạn.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-wrap gap-4 pt-2">
              <Link
                href="/register"
                className="btn-primary px-8 py-3.5 text-base select-none hover:-translate-y-0.5 shadow-md"
              >
                Bắt đầu miễn phí
              </Link>
              <Link
                href="/recipes"
                className="btn-outline border-brand-primary bg-white text-brand-primary hover:bg-brand-primary/5 px-8 py-3.5 text-base select-none hover:-translate-y-0.5"
              >
                Khám phá công thức
              </Link>
            </div>

            {/* Value Props */}
            <div className="grid grid-cols-2 gap-4 pt-6 border-t border-slate-250">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <HiCheck className="text-emerald-500 text-base" /> Gợi ý món ăn bằng AI
              </div>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <HiCheck className="text-emerald-500 text-base" /> Tự động lên thực đơn tuần
              </div>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <HiCheck className="text-emerald-500 text-base" /> Quản lý tủ lạnh thông minh
              </div>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <HiCheck className="text-emerald-500 text-base" /> Chống lãng phí thực phẩm
              </div>
            </div>
          </ScrollReveal>

          {/* Right Hero Mockups */}
          <ScrollReveal className="lg:col-span-5 relative flex justify-center items-center" delay={0.2}>

            {/* Main Mockup Card */}
            <div className="w-full max-w-[420px] rounded-2xl border border-brand-primary/15 bg-white p-5 shadow-brand-lg relative z-10 animate-float">

              {/* Card Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-500"></span>
                  <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                  <span className="w-3 h-3 rounded-full bg-green-500"></span>
                </div>
                <span className="text-xs font-semibold text-brand-primary bg-brand-primary/10 px-2.5 py-0.5 rounded border border-brand-primary/20">
                  AI Recommendation
                </span>
              </div>

              {/* Mockup Recipe Item */}
              <div className="mt-4 space-y-4">
                <div className="h-40 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl relative overflow-hidden flex items-center justify-center border border-brand-primary/10">
                  <span className="text-6xl animate-float-slow">🍲</span>

                  {/* Floating Micro-Badge */}
                  <div className="absolute top-3 left-3 bg-white/90 border border-brand-primary/15 px-2 py-1 rounded text-[10px] font-bold text-brand-primary backdrop-blur-sm shadow-sm">
                    🔥 240 kcal
                  </div>
                </div>

                <div className="space-y-1.5 text-left">
                  <h4 className="font-bold text-slate-900 text-base">Phở bò Hà Nội chuẩn vị</h4>
                  <p className="text-xs text-slate-505 line-clamp-2 leading-relaxed">
                    Sử dụng các nguyên liệu sẵn có: thịt bò chín, bánh phở, hành lá, ngò gai.
                  </p>
                </div>

                {/* Score Indicator */}
                <div className="pt-2">
                  <div className="flex justify-between items-center text-xs font-semibold mb-1">
                    <span className="text-slate-500">Độ phù hợp tủ lạnh</span>
                    <span className="text-brand-primary">92%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div className="bg-gradient-to-r from-brand-primary to-brand-secondary h-1.5 rounded-full" style={{ width: '92%' }}></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Background floating element 1 */}
            <div className="hidden sm:block absolute -top-6 -right-4 bg-white/95 border border-brand-primary/15 p-3.5 rounded-xl shadow-brand-md z-20 animate-float-slow max-w-[180px] text-left">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                  ⚠️
                </div>
                <div>
                  <h5 className="text-[11px] font-bold text-slate-900 leading-tight">Cảnh báo lãng phí</h5>
                  <p className="text-[9px] text-slate-505 mt-0.5">Trứng còn 2 ngày hết hạn</p>
                </div>
              </div>
            </div>

            {/* Background floating element 2 */}
            <div className="hidden sm:block absolute -bottom-6 -left-4 bg-white/95 border border-brand-primary/15 p-3.5 rounded-xl shadow-brand-md z-20 animate-float max-w-[200px] text-left" style={{ animationDelay: '2s' }}>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded bg-brand-primary/10 text-brand-primary flex items-center justify-center shrink-0">
                  🛒
                </div>
                <div>
                  <h5 className="text-[11px] font-bold text-slate-900 leading-tight">Danh sách mua sắm</h5>
                  <p className="text-[9px] text-slate-505 mt-0.5">Đã gộp trùng 5 nguyên liệu</p>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </section>

        {/* -------------------- SECTION TÍNH NĂNG NỔI BẬT -------------------- */}
        <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-20 lg:py-28 border-t border-slate-200 text-center">
          <ScrollReveal className="max-w-3xl mx-auto space-y-3 mb-16">
            <span className="text-brand-primary text-xs font-bold uppercase tracking-wider">Mở khóa sức mạnh AI</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900">Những tính năng vượt trội từ MealAI</h2>
            <p className="text-slate-655 text-sm sm:text-base leading-relaxed">
              Tích hợp công nghệ AI tiên tiến mang lại trải nghiệm tiện nghi, tiết kiệm thời gian nấu nướng và tiền bạc cho gia đình bạn.
            </p>
          </ScrollReveal>

          <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: LuChefHat, color: 'text-emerald-600 bg-emerald-50 border-emerald-100', title: 'AI Gợi ý món ăn', desc: 'Đề xuất các món ăn tối ưu nhất dựa trên sở thích, dị ứng, calories mục tiêu và nguyên liệu sẵn có trong tủ lạnh của bạn.' },
              { icon: LuCalendarDays, color: 'text-blue-600 bg-blue-50 border-blue-100', title: 'Lập thực đơn tuần', desc: 'Tự động thiết kế kế hoạch ăn uống 3 bữa/ngày cho cả tuần chỉ trong 1 cú click. Tùy biến số lượng người ăn linh hoạt.' },
              { icon: LuRefrigerator, color: 'text-purple-600 bg-purple-50 border-purple-100', title: 'Tủ lạnh thông minh', desc: 'Quản lý số lượng và thời gian hết hạn của nguyên liệu trong nhà. Nhận cảnh báo thông minh trước khi thực phẩm bị hỏng.' },
              { icon: LuShoppingBasket, color: 'text-pink-600 bg-pink-50 border-pink-100', title: 'Danh sách mua sắm', desc: 'Tự động tạo danh sách đi chợ, gộp các nguyên liệu trùng nhau từ thực đơn tuần và trừ đi phần thực phẩm đã có sẵn.' },
              { icon: LuBrainCircuit, color: 'text-amber-600 bg-amber-50 border-amber-100', title: 'AI Insights', desc: 'Phân tích thói quen ăn uống, đưa ra khuyến nghị dinh dưỡng cá nhân hóa nhằm cải thiện sức khỏe và lối sống lành mạnh.' },
              { icon: LuApple, color: 'text-rose-600 bg-rose-50 border-rose-100', title: 'Tính calo & dinh dưỡng', desc: 'Công thức Mifflin-St Jeor giúp tính toán TDEE và nhu cầu năng lượng mỗi ngày, hỗ trợ kiểm soát cân nặng khoa học.' },
            ].map((feature, i) => (
              <FadeInUp key={i} className="glassmorphism rounded-2xl p-6 text-left transition duration-300 transform hover:-translate-y-1 hover:border-brand-primary/35 hover:shadow-brand-md group">
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center border ${feature.color} mb-4 group-hover:scale-105 transition shadow-sm`}>
                  <feature.icon className="text-3xl" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{feature.title}</h3>
                <p className="text-slate-505 text-xs sm:text-sm leading-relaxed">{feature.desc}</p>
              </FadeInUp>
            ))}
          </StaggerContainer>
        </section>

        {/* -------------------- AI CHAT DEMO SECTION -------------------- */}
        <section ref={chatSectionRef} className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-16 lg:py-24 border-t border-slate-200">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">

            {/* Left explanation */}
            <ScrollReveal className="lg:col-span-5 space-y-5 text-left">
              <span className="text-brand-primary text-xs font-bold uppercase tracking-wider">Trải nghiệm tương tác trực quan</span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 leading-tight">Trò chuyện với AI Dinh dưỡng của bạn</h2>
              <p className="text-slate-655 text-sm sm:text-base leading-relaxed">
                Khám phá năng lực xử lý ngôn ngữ tự nhiên của MealAI. Chỉ cần gõ những nguyên liệu bạn có hoặc yêu cầu thực đơn cụ thể, chatbot sẽ lập tức thiết kế phương án tối ưu nhất.
              </p>

              {/* Interactive buttons to switch tabs */}
              <div className="space-y-3 pt-3">
                <button
                  onClick={() => setActiveChatTab('ingredients')}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border text-left transition select-none ${
                    activeChatTab === 'ingredients'
                      ? 'border-brand-primary bg-emerald-500/5 text-brand-primary font-bold'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">1. Gợi ý từ tủ lạnh</h4>
                    <p className="text-xs text-slate-505 mt-0.5">Nhập các nguyên liệu bạn có sẵn ở nhà</p>
                  </div>
                  <HiChevronRight className="text-lg" />
                </button>

                <button
                  onClick={() => setActiveChatTab('planner')}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border text-left transition select-none ${
                    activeChatTab === 'planner'
                      ? 'border-brand-primary bg-emerald-500/5 text-brand-primary font-bold'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">2. Lập thực đơn theo yêu cầu</h4>
                    <p className="text-xs text-slate-505 mt-0.5">Yêu cầu thực đơn theo chế độ ăn riêng biệt</p>
                  </div>
                  <HiChevronRight className="text-lg" />
                </button>
              </div>
            </ScrollReveal>

            {/* Right Simulated Chat Viewport */}
            <ScrollReveal className="lg:col-span-7" delay={0.2}>
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-brand-lg flex flex-col h-[480px]">

                {/* Chat Header */}
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold">
                      🤖
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">MealAI Chatbot</h4>
                      <p className="text-[10px] text-brand-primary flex items-center gap-1 font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse"></span> Active (Gemini 2.5)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                    <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                    <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                  </div>
                </div>

                {/* Chat Feed */}
                <div className="flex-1 p-5 overflow-y-auto space-y-4 text-left text-sm scrollbar-thin">
                  {chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex gap-3 max-w-[85%] ${msg.sender === 'user' ? 'ml-auto flex-row-reverse' : ''} transition-all duration-300`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 shadow-sm ${
                        msg.sender === 'user' ? 'bg-emerald-600 text-white' : 'bg-slate-105 text-slate-600'
                      }`}>
                        {msg.sender === 'user' ? <HiUser /> : '🤖'}
                      </div>

                      <div className="space-y-3">
                        <div className={`p-3.5 rounded-2xl ${
                          msg.sender === 'user'
                            ? 'bg-emerald-600 text-white rounded-tr-none'
                            : 'bg-slate-50 border border-brand-primary/10 text-slate-800 rounded-tl-none'
                        }`}>
                          <p className="leading-relaxed text-xs sm:text-sm font-medium">{msg.text}</p>
                        </div>

                        {/* If AI has suggested recipes, show cards */}
                        {msg.sender === 'ai' && msg.recipes && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                            {msg.recipes.map((rec: any, rIdx: number) => (
                              <div key={rIdx} className="bg-white border border-brand-primary/15 rounded-xl p-3.5 space-y-2 shadow-sm">
                                <h5 className="font-bold text-brand-primary text-xs sm:text-sm">{rec.name}</h5>
                                <div className="flex justify-between text-[10px] text-slate-505 font-bold">
                                  <span>⏱️ {rec.time} phút</span>
                                  <span>🔥 {rec.cal} kcal</span>
                                </div>
                                <div className="text-[10px] text-slate-500 truncate font-semibold">
                                  Nguyên liệu: {rec.matched}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* If AI has generated planning items, show table */}
                        {msg.sender === 'ai' && msg.planner && (
                          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden text-xs shadow-sm">
                            <div className="grid grid-cols-4 bg-slate-50 p-2 font-bold border-b border-slate-200 text-slate-700">
                              <div>Ngày</div>
                              <div>Sáng</div>
                              <div>Trưa</div>
                              <div>Tối</div>
                            </div>
                            {msg.planner.map((dayPlan: any, dIdx: number) => (
                              <div key={dIdx} className="grid grid-cols-4 p-2 border-b border-slate-100 hover:bg-slate-50 text-slate-650 font-medium">
                                <div className="font-bold text-brand-primary">{dayPlan.day}</div>
                                <div className="truncate text-slate-700 pr-1">{dayPlan.breakfast}</div>
                                <div className="truncate text-slate-700 pr-1">{dayPlan.lunch}</div>
                                <div className="truncate text-slate-700">{dayPlan.dinner}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Typing Indicator */}
                  {isTyping && (
                    <div className="flex gap-3 max-w-[85%]">
                      <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-sm shrink-0">
                        🤖
                      </div>
                      <div className="bg-slate-50 border border-slate-100 p-3 rounded-2xl rounded-tl-none flex items-center gap-1 shadow-sm">
                        <span className="w-1.5 h-1.5 bg-brand-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                        <span className="w-1.5 h-1.5 bg-brand-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                        <span className="w-1.5 h-1.5 bg-brand-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Input Bar mockup */}
                <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex gap-2">
                  <input
                     type="text"
                     disabled
                     placeholder={activeChatTab === 'ingredients' ? 'Nhập nguyên liệu: trứng, cà chua...' : 'Lập thực đơn giảm cân...'}
                     className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs outline-none text-slate-400 cursor-not-allowed"
                  />
                  <button
                     type="button"
                     disabled
                     className="px-4 py-2 bg-brand-primary/50 text-white rounded-xl text-xs font-semibold cursor-not-allowed"
                  >
                     Gửi
                  </button>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* -------------------- CÁCH HOẠT ĐỘNG SECTION -------------------- */}
        <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-20 lg:py-28 border-t border-slate-200 text-center">
          <ScrollReveal className="max-w-3xl mx-auto space-y-3 mb-16">
            <span className="text-brand-primary text-xs font-bold uppercase tracking-wider">Quy trình đơn giản</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900">Cách hệ thống MealAI hoạt động</h2>
            <p className="text-slate-655 text-sm sm:text-base leading-relaxed">
              Chỉ với vài thao tác cơ bản, bạn đã có một kế hoạch dinh dưỡng hoàn chỉnh chuẩn khoa học.
            </p>
          </ScrollReveal>

          {/* Timeline flow chart */}
          <StaggerContainer className="grid grid-cols-1 md:grid-cols-4 gap-8 relative">

            {/* Desktop Connector Line */}
            <div className="hidden md:block absolute top-[44px] left-[12%] right-[12%] h-0.5 bg-gradient-to-r from-brand-primary/20 via-brand-primary/40 to-brand-secondary/20 z-0"></div>

            {[
              { num: '1', title: 'Nhập nguyên liệu', desc: 'Khai báo các thực phẩm hiện có trong tủ lạnh nhà bạn và số ngày còn lại trước khi hết hạn.' },
              { num: '2', title: 'AI phân tích', desc: 'Trí tuệ nhân tạo tính toán calories, so khớp thói quen, loại bỏ các chất gây dị ứng theo hồ sơ cá nhân.' },
              { num: '3', title: 'Tạo thực đơn', desc: 'Nhận ngay thực đơn tuần tự động được thiết kế riêng, đảm bảo cung cấp đủ dinh dưỡng.' },
              { num: '4', title: 'Tạo danh sách mua sắm', desc: 'Hệ thống tự động gom các nguyên liệu cần mua thêm để bạn mang đi siêu thị một cách tiện lợi.' }
            ].map((step, i) => (
              <FadeInUp key={i} className="relative z-10 space-y-4 flex flex-col items-center group">
                {/* Glowing Node */}
                <div className="w-12 h-12 rounded-full bg-white border-2 border-brand-primary text-brand-primary font-bold text-lg flex items-center justify-center shadow-brand-md group-hover:scale-110 transition duration-300">
                  {step.num}
                </div>
                <div className="space-y-1.5 max-w-[260px]">
                  <h4 className="font-bold text-slate-900 text-base">{step.title}</h4>
                  <p className="text-xs text-slate-505 leading-relaxed">{step.desc}</p>
                </div>
              </FadeInUp>
            ))}
          </StaggerContainer>
        </section>

        {/* -------------------- THỐNG KÊ HỆ THỐNG -------------------- */}
        <ScrollReveal className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-20 border border-slate-100 bg-slate-50/50 rounded-3xl mb-12 shadow-brand-sm">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">

            <div className="space-y-2">
              <p className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
                <AnimatedCounter to={500} suffix="+" />
              </p>
              <p className="text-xs sm:text-sm text-slate-505 font-bold">Công thức nấu ăn Việt</p>
            </div>

            <div className="space-y-2">
              <p className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
                <AnimatedCounter to={1000} suffix="+" />
              </p>
              <p className="text-xs sm:text-sm text-slate-550 font-bold">Thực đơn được tạo</p>
            </div>

            <div className="space-y-2">
              <p className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
                <AnimatedCounter to={3000} suffix="+" />
              </p>
              <p className="text-xs sm:text-sm text-slate-550 font-bold">Lượt gợi ý từ AI</p>
            </div>

            <div className="space-y-2">
              <p className="text-3xl sm:text-5xl font-extrabold text-brand-primary tracking-tight">
                <AnimatedCounter to={95} suffix="%" className="text-brand-primary" />
              </p>
              <p className="text-xs sm:text-sm text-slate-550 font-bold">Người dùng hài lòng</p>
            </div>

          </div>
        </ScrollReveal>

        {/* -------------------- TESTIMONIALS SECTION -------------------- */}
        <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-20 lg:py-28 border-t border-slate-200 text-center">
          <ScrollReveal className="max-w-3xl mx-auto space-y-3 mb-16">
            <span className="text-brand-primary text-xs font-bold uppercase tracking-wider">Đánh giá thực tế</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900">Người dùng nói gì về MealAI</h2>
            <p className="text-slate-655 text-sm sm:text-base leading-relaxed">
              Lắng nghe câu chuyện từ các bà nội trợ và bạn trẻ bận rộn sau khi đồng hành cùng trợ lý bữa ăn MealAI.
            </p>
          </ScrollReveal>

          <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { name: 'Nguyễn Thị Hoa', role: 'Nội trợ (Hà Nội)', text: 'MealAI giúp tôi tiết kiệm rất nhiều thời gian suy nghĩ nấu gì mỗi ngày. Việc gộp danh sách đi chợ rất hữu dụng, tủ lạnh nhà tôi không còn tình trạng rau héo lãng phí nữa.', rating: 5, avatar: '👩‍🍳' },
              { name: 'Trần Minh Nam', role: 'Kỹ sư phần mềm (Đà Nẵng)', text: 'Tôi tập gym và cần kiểm soát calories chặt chẽ. AI gợi ý công thức và phân chia calories bữa sáng/trưa/tối rất chuẩn xác. Tính năng XAI giải thích lý do rất thông minh.', rating: 5, avatar: '👨‍💻' },
              { name: 'Lê Phương Thảo', role: 'Nhân viên văn phòng (TP.HCM)', text: 'Thực đơn tuần tự động rất ngon miệng và dễ chế biến. Tôi rất thích chatbot Gemini, phản hồi nhanh và gợi ý công thức có tâm, phù hợp với khẩu vị miền Nam của tôi.', rating: 5, avatar: '👩‍💼' }
            ].map((testi, i) => (
              <FadeInUp key={i} className="bg-white border border-slate-150 rounded-2xl p-6 text-left flex flex-col justify-between space-y-4 shadow-brand-sm">
                <p className="text-slate-655 text-sm italic leading-relaxed">"{testi.text}"</p>
                <div className="flex items-center gap-3 pt-3 border-t border-slate-100 shrink-0">
                  <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-xl shrink-0">
                    {testi.avatar}
                  </div>
                  <div>
                    <h5 className="font-bold text-slate-900 text-sm">{testi.name}</h5>
                    <p className="text-[10px] text-slate-505 font-bold">{testi.role}</p>
                    <div className="flex gap-0.5 mt-1">
                      {Array.from({ length: testi.rating }).map((_, rIdx) => (
                        <HiStar key={rIdx} className="text-brand-accent text-xs" />
                      ))}
                    </div>
                  </div>
                </div>
              </FadeInUp>
            ))}
          </StaggerContainer>
        </section>

        {/* -------------------- FINAL CALL TO ACTION -------------------- */}
        <ScrollReveal className="relative z-10 max-w-4xl mx-auto px-4 py-16 text-center mb-20">
          <div className="card-ai-hero border border-brand-primary/20 rounded-3xl p-8 sm:p-12 space-y-6 relative overflow-hidden">

            {/* Glow backing */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-brand-primary/5 rounded-full blur-[80px] z-0 pointer-events-none"></div>

            <div className="relative z-10 space-y-3">
              <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900">Sẵn sàng để AI lên thực đơn cho gia đình bạn?</h2>
              <p className="text-slate-655 text-sm sm:text-base max-w-xl mx-auto font-medium">
                Bắt đầu hành trình ăn uống khoa học, tiện lợi và tiết kiệm cùng MealAI ngay hôm nay.
              </p>
            </div>

            <div className="relative z-10 flex flex-wrap justify-center gap-4 pt-2">
              <Link
                href="/register"
                className="px-8 py-3 bg-gradient-to-r from-brand-primary to-brand-secondary text-white rounded-xl font-bold hover:scale-[1.02] active:scale-[0.98] transition transform shadow-brand-glow"
              >
                Đăng ký ngay
              </Link>
              <Link
                href="/login"
                className="px-8 py-3 border border-slate-200 bg-white text-slate-800 rounded-xl font-bold hover:bg-slate-50 transition transform hover:-translate-y-0.5"
              >
                Đăng nhập
              </Link>
            </div>
          </div>
        </ScrollReveal>
      </div>
    );
  }

  // ==================== 2. AUTHENTICATED USER AI DASHBOARD VIEW ====================
  const calorieTarget = Number(user.dailyCalorieTarget) || 0;
  const caloriesConsumed = getCaloriesConsumed();
  const calorieProgress = calorieTarget > 0 ? Math.min(100, Math.round((caloriesConsumed / calorieTarget) * 100)) : 0;
  const todayMeals = getTodayMeals();
  const pastMealCount = todayMeals.filter((item: any) => isPastMealSlot(item.mealDate, item.mealType)).length;
  const macros = getTodayMacroNutrients();
  const dashboardInsights = buildDashboardInsights({
    todayMeals,
    caloriesConsumed,
    calorieTarget,
    macros,
    pastMealCount,
    inventoryStats,
    inventoryItems,
    nutritionAnalysis,
  });

  // Progress ring constants
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (calorieProgress / 100) * circumference;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">

      {/* -------------------- SECTION 1 - HERO DASHBOARD & HEADER -------------------- */}
      <div className="card-ai-hero flex flex-col lg:flex-row items-center justify-between gap-6">

        {/* Glow effect */}
        <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-brand-primary/5 rounded-full blur-3xl pointer-events-none"></div>

        <div className="space-y-4 max-w-xl text-left relative z-10">
          <div>
            <span className="text-brand-primary text-xs font-extrabold uppercase tracking-wider bg-white/80 px-3 py-1 rounded-brand-sm border border-brand-primary/20 shadow-sm">
              Trung tâm điều khiển AI
            </span>
            <h1 className="text-3xl font-extrabold mt-3 tracking-tight text-slate-900">Chào ngày mới, {user.fullName}! 👋</h1>
            <p className="text-slate-650 text-sm mt-1.5 leading-relaxed font-medium">
              Hôm nay là {new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. AI đã chuẩn bị sẵn sàng thực đơn tối ưu cho sức khỏe của bạn.
            </p>
          </div>

          {/* Mini Stats Grid */}
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="bg-white/60 border border-brand-primary/10 rounded-brand-sm p-3 shadow-sm">
              <span className="text-[10px] text-brand-primary uppercase tracking-wider block font-bold">Bữa ăn kế tiếp</span>
              <span className="text-sm font-extrabold block mt-0.5 text-slate-800">{getNextMealLabel()}</span>
            </div>
            <div className="bg-white/60 border border-brand-primary/10 rounded-brand-sm p-3 shadow-sm">
              <span className="text-[10px] text-brand-primary uppercase tracking-wider block font-bold">Cần giải cứu</span>
              <span className="text-sm font-extrabold block mt-0.5 text-slate-800">{inventoryStats.expiring} nguyên liệu sắp hết hạn</span>
            </div>
          </div>
        </div>

        {/* Progress Ring Visualizer */}
        <div className="flex flex-col sm:flex-row items-center gap-6 bg-white border border-brand-primary/15 rounded-brand-md p-5 shrink-0 relative z-10 w-full sm:w-auto justify-center sm:justify-start shadow-brand-sm">
          <div className="relative w-24 h-24 shrink-0">
            {/* SVG Progress Circle */}
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="48"
                cy="48"
                r={radius}
                className="text-slate-100 stroke-current"
                strokeWidth="7"
                fill="transparent"
              />
              <circle
                cx="48"
                cy="48"
                r={radius}
                className="text-brand-primary stroke-current transition-all duration-500 ease-out"
                strokeWidth="7"
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-lg font-black leading-none text-slate-900">{calorieProgress}%</span>
              <span className="text-[8px] uppercase tracking-wider text-slate-500 font-bold mt-0.5">Nạp vào</span>
            </div>
          </div>

          <div className="text-center sm:text-left space-y-1">
            <p className="text-xs text-slate-500 font-bold">Calories ngày hôm nay</p>
            <p className="text-2xl font-black text-slate-900">
              {caloriesConsumed}{' '}
              <span className="text-xs font-normal text-slate-500">
                {calorieTarget > 0 ? `/ ${calorieTarget} kcal` : 'kcal · chưa có TDEE'}
              </span>
            </p>
            <p className="text-[10px] text-brand-secondary italic font-semibold">
              {caloriesConsumed === 0
                ? 'Chưa có bữa nào được tính hôm nay'
                : calorieTarget <= 0
                  ? 'Cập nhật hồ sơ cơ thể để tính mục tiêu calories'
                : caloriesConsumed > calorieTarget
                  ? 'Calories hôm nay đang vượt mục tiêu'
                  : `Đã tính calories từ ${pastMealCount} món thuộc bữa đã qua`}
            </p>
          </div>
        </div>
      </div>

      {/* -------------------- MAIN GRID DASHBOARD 2 COLUMNS -------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

        {/* ==================== LEFT COLUMN: PRIMARY AREA (lg:col-span-2) ==================== */}
        <div className="lg:col-span-2 space-y-8">

          {/* -------------------- SECTION 6 - TODAY MEAL PLAN -------------------- */}
          <div className="card-dashboard space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-brand-light-border">
              <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <HiCalendar className="text-brand-primary text-xl" /> Thực đơn hôm nay
              </h2>
              <span className="text-xs font-bold text-slate-500">
                Thứ tự các bữa ăn khoa học
              </span>
            </div>

            {todayMeals.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-4">
                <p className="text-3xl mb-2">📅</p>
                <h4 className="font-bold text-gray-900 text-sm">Chưa có thực đơn cho hôm nay</h4>
                <p className="text-xs text-gray-500 mt-1 mb-4 max-w-xs mx-auto">
                  Hãy lên thực đơn tuần mới tự động bằng AI để theo dõi calo và ăn uống khoa học hơn.
                </p>
                <Link
                  href="/meal-planner"
                  className="btn-primary-sm inline-flex"
                >
                  Lập thực đơn ngay
                </Link>
              </div>
            ) : (
              <>
                <TodayMealsGroups
                  todayMeals={todayMeals}
                  getMealTypeLabel={getMealTypeLabel}
                />
                <div className="pt-3 text-center">
                  <Link
                    href="/meal-planner"
                    className="btn-outline-sm inline-flex items-center gap-1.5 text-xs"
                  >
                    <HiCalendar className="text-sm" />
                    Quản lý thực đơn chi tiết
                  </Link>
                </div>
              </>
            )}
          </div>

          {/* -------------------- SECTION 4 - AI RECOMMENDATIONS -------------------- */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <span className="badge-ai">🤖 AI</span> AI đề xuất nâng cao
              </h2>
              <Link href="/recipes" className="text-xs font-bold text-brand-primary hover:underline flex items-center gap-0.5">
                Xem thêm <HiArrowRight />
              </Link>
            </div>

            {recommendationLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-3xl h-64 animate-pulse" />
                ))}
              </div>
            ) : recommendationError ? (
              <div className="text-center py-12 bg-white border border-red-100 rounded-3xl p-6">
                <p className="text-4xl mb-2">⚠️</p>
                <h4 className="font-bold text-gray-900 text-sm">{recommendationError}</h4>
              </div>
            ) : recommendations.length === 0 ? (
              <div className="text-center py-12 bg-white border border-gray-200 rounded-3xl p-6">
                <p className="text-4xl mb-2">🍽️</p>
                <h4 className="font-bold text-gray-900 text-sm">{EMPTY_RECOMMENDATION_MESSAGE}</h4>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {recommendations.map((rec: RecommendationItem, i: number) => {
                  const recipe = rec.recipe;
                  return (
                    <div key={recipe.id || i} className="card-ai-recommendation flex flex-col justify-between group">
                      <div className="relative h-44 bg-gradient-to-br from-brand-primary/10 to-brand-secondary/10 flex items-center justify-center shrink-0 overflow-hidden">
                        {recipe.imageUrl ? (
                          <img
                            src={recipe.imageUrl.startsWith('http') ? recipe.imageUrl : `http://localhost:3001${recipe.imageUrl}`}
                            alt={recipe.name}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <span className="text-6xl group-hover:scale-105 transition duration-300">🍲</span>
                        )}

                        {/* Floating Similarity Match score */}
                        <div className="absolute top-3 left-3 bg-slate-900/95 border border-slate-800 text-brand-primary px-2.5 py-0.5 rounded-brand-sm text-xs font-extrabold shadow-md">
                          Độ phù hợp: {getRecommendationScorePercent(rec)}%
                        </div>
                      </div>

                      <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
                        <div className="space-y-3 text-left">
                          <div className="space-y-1">
                            <h3 className="font-bold text-gray-950 text-base line-clamp-1 group-hover:text-emerald-700">
                              <Link href={`/recipes/${recipe.id}`}>{recipe.name}</Link>
                            </h3>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 font-medium">
                              <span>🔥 {recipe.calories} kcal</span>
                              {recipe.cookingTime ? <span>⏱️ {recipe.cookingTime} phút</span> : null}
                              {recipe.estimatedCost ? <span>💰 ~{Math.round((recipe.estimatedCost || 0) / 1000)}k VNĐ</span> : null}
                            </div>
                          </div>

                          <div className="grid grid-cols-4 gap-2 text-center">
                            {[
                              { label: 'Calories', value: `${recipe.calories}` },
                              { label: 'Protein', value: `${recipe.protein}g` },
                              { label: 'Carbs', value: `${recipe.carbs}g` },
                              { label: 'Fat', value: `${recipe.fat}g` },
                            ].map((macro) => (
                              <div key={macro.label} className="rounded-brand-sm border border-brand-light-border bg-white/80 px-2 py-2">
                                <p className="text-[10px] font-bold uppercase text-slate-400">{macro.label}</p>
                                <p className="text-xs font-extrabold text-slate-800">{macro.value}</p>
                              </div>
                            ))}
                          </div>

                          {/* AI Reason for recommendation */}
                          {(rec.reasons?.length ?? 0) > 0 && (
                            <div className="bg-brand-primary/5 border border-brand-primary/10 rounded-brand-sm p-3 text-xs text-slate-700 flex items-start gap-2 text-left">
                              <span className="text-brand-primary">💡</span>
                              <p className="font-medium italic leading-relaxed">"{rec.reasons?.[0]}"</p>
                            </div>
                          )}
                        </div>

                        <div className="flex justify-between items-center pt-3 border-t border-gray-100 shrink-0">
                          <button
                            type="button"
                            onClick={() => setSelectedRecForExplanation(rec)}
                            className="text-xs font-bold text-brand-primary hover:text-brand-primary-hover flex items-center gap-0.5 hover:underline cursor-pointer outline-none"
                          >
                            <HiSparkles className="text-brand-primary animate-pulse" /> Giải thích AI
                          </button>
                          <Link
                            href={`/recipes/${recipe.id}`}
                            className="btn-primary-sm"
                          >
                            Nấu món này
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* ==================== RIGHT COLUMN: SIDEBAR AREA (lg:col-span-1) ==================== */}
        <div className="space-y-8">

          {/* -------------------- SECTION 2 - AI INSIGHTS -------------------- */}
          <div className="card-ai-insight space-y-4 text-left">
            <h3 className="font-extrabold text-white text-base flex items-center gap-2 pb-3 border-b border-white/10">
              <HiSparkles className="text-white animate-pulse text-lg" /> AI Insights hôm nay
            </h3>

            <div className="space-y-3.5">
              {dashboardInsights.length === 0 ? (
                <div className="rounded-brand-sm border border-white/10 bg-white/5 p-3 text-xs text-white/90">
                  Chưa có đủ dữ liệu để phân tích AI Insights hôm nay. Hãy tạo thực đơn hoặc đánh dấu món đã ăn.
                </div>
              ) : (
                dashboardInsights.map((insight, index) => {
                  const toneClass =
                    insight.tone === 'rose'
                      ? 'text-rose-200'
                      : insight.tone === 'amber'
                        ? 'text-amber-250'
                        : insight.tone === 'teal'
                          ? 'text-teal-200'
                          : 'text-emerald-250';

                  return (
                    <div key={`${insight.label}-${index}`} className={`space-y-1 text-xs ${index > 0 ? 'border-t border-white/10 pt-3' : ''}`}>
                      <span className={`${toneClass} font-extrabold uppercase tracking-wider block text-[10px]`}>
                        {insight.label}
                      </span>
                      <p className="text-white/95 font-medium leading-relaxed">{insight.message}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>



          {/* -------------------- SECTION 5 - SMART INVENTORY -------------------- */}
          <div className="card-dashboard space-y-4 text-left">
            <h3 className="font-extrabold text-slate-900 text-base flex items-center justify-between">
              <span>Kho nguyên liệu</span>
              <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-brand-sm">
                Tổng: {inventoryStats.total}
              </span>
            </h3>

            <div className="p-4 bg-brand-warning/5 border border-brand-warning/20 rounded-brand-md flex items-center justify-between gap-4 shadow-sm">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-brand-warning block">Sắp hết hạn</span>
                <p className="text-sm font-extrabold text-slate-800">{inventoryStats.expiring} thực phẩm cần giải cứu</p>
                <p className="text-[11px] font-semibold text-slate-500">
                  {inventoryStats.expired > 0
                    ? `${inventoryStats.expired} thực phẩm đã hết hạn`
                    : 'Không có nguyên liệu hết hạn'}
                </p>
              </div>
              <Link
                href="/inventory"
                className="px-3 py-2 bg-brand-warning hover:bg-amber-600 text-white rounded-brand-sm text-xs font-bold transition-all shadow-brand-sm hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap outline-none"
              >
                Giải cứu
              </Link>
            </div>
          </div>

        </div>

      </div>

      {/* XAI explanation modal */}
      {selectedRecForExplanation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in">
          <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-gray-100 overflow-hidden transform transition-all animate-scale-in max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 px-6 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
              <div>
                <h3 className="flex items-center gap-2 text-lg font-bold">
                  <HiSparkles />
                  Trí Tuệ Nhân Tạo Giải Thích (XAI)
                </h3>
                <p className="text-xs text-emerald-100 mt-0.5 text-left">
                  Tại sao món <span className="font-semibold">{selectedRecForExplanation.recipe.name}</span> phù hợp với bạn?
                </p>
              </div>
              <button
                onClick={() => setSelectedRecForExplanation(null)}
                className="p-1 text-white/80 hover:text-white rounded-lg hover:bg-white/10 transition"
                aria-label="Đóng"
              >
                <HiX className="text-xl" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 sm:p-6 space-y-6 flex-1 overflow-y-auto">
              {/* Overall Score */}
              <div className="text-center p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                <span className="text-sm text-gray-500 block font-semibold">Độ phù hợp tổng thể</span>
                <span className="text-3xl font-extrabold text-emerald-700">
                  {Math.round(selectedRecForExplanation.score.total * 100)}%
                </span>
              </div>

              {/* 5 Scoring Dimensions */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 text-left">Các yếu tố đánh giá</h4>
                {[
                  { label: 'Nguyên liệu sẵn có', value: selectedRecForExplanation.score.ingredientMatch, weight: '35%' },
                  { label: 'Hạn chế lãng phí (Nguyên liệu sắp hết hạn)', value: selectedRecForExplanation.score.wasteReduction, weight: '25%' },
                  { label: 'Khẩu vị & Sở thích cá nhân', value: selectedRecForExplanation.score.preferenceMatch, weight: '20%' },
                  { label: 'Thời gian nấu nướng', value: selectedRecForExplanation.score.cookTimeScore, weight: '10%' },
                  { label: 'Đáp ứng Calo mục tiêu', value: selectedRecForExplanation.score.nutritionScore, weight: '10%' },
                ].map((item, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-gray-700">{item.label} <span className="text-gray-400 font-normal">({item.weight})</span></span>
                      <span className="text-emerald-700 font-semibold">{Math.round(item.value * 100)}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-emerald-500 h-2 rounded-full transition-all"
                        style={{ width: `${Math.round(item.value * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Detail list of reasons */}
              {selectedRecForExplanation.reasons?.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 text-left">Chi tiết các tiêu chí đạt</h4>
                  <ul className="space-y-2 bg-gray-50 border border-gray-100 p-4 rounded-2xl text-left">
                    {selectedRecForExplanation.reasons.map((reason: string, idx: number) => (
                      <li key={idx} className="flex gap-2 items-start text-sm text-gray-700">
                        <HiCheckCircle className="text-emerald-500 text-lg flex-shrink-0 mt-0.5" />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Matched / Missing ingredients */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                {/* Matched */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1">
                    🟢 Đã có sẵn ({selectedRecForExplanation.matchedInventory?.length || 0})
                  </h4>
                  <div className="max-h-28 overflow-y-auto space-y-1 text-xs">
                    {selectedRecForExplanation.matchedInventory?.length > 0 ? (
                      selectedRecForExplanation.matchedInventory.map((item: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-green-50 rounded-lg border border-green-100">
                          <span className="font-medium text-green-800">{item.name}</span>
                          {item.urgency && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-100 text-red-700 font-bold uppercase animate-pulse">
                              Hết hạn gấp
                            </span>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-400 italic">Không có nguyên liệu sẵn có.</p>
                    )}
                  </div>
                </div>

                {/* Missing */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1">
                    🔴 Cần mua thêm ({selectedRecForExplanation.missingIngredients?.length || 0})
                  </h4>
                  <div className="max-h-28 overflow-y-auto space-y-1 text-xs">
                    {selectedRecForExplanation.missingIngredients?.length > 0 ? (
                      selectedRecForExplanation.missingIngredients.map((item: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg border border-gray-200">
                          <span className="font-medium text-gray-700">{item.name}</span>
                          <span className="text-gray-400">
                            {item.quantity} {item.unit}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-400 italic">Đầy đủ nguyên liệu!</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button
                onClick={() => setSelectedRecForExplanation(null)}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-sm transition shadow-sm"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
