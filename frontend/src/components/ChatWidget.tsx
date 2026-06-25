'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { chatbotAPI } from '@/lib/api';
import { notifyMealPlanChanged } from '@/lib/mealPlanEvents';

interface Message {
  id?: string;
  role: 'user' | 'model';
  content: string;
  metadata?: {
    action?: string;
    name?: string;
    result?: any;
    steps?: any[];
    args?: any;
  };
  createdAt?: string;
}

function renderMarkdown(text: string | null | undefined): React.ReactNode {
  if (!text || text.trim() === '') {
    return <span className="italic text-slate-300 text-xs">(Không có phản hồi)</span>;
  }

  const parseInline = (str: string, keyPrefix: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    const regex = /\*\*(.*?)\*\*|\*(.*?)\*/g;
    let lastIndex = 0;
    let match;
    let i = 0;

    while ((match = regex.exec(str)) !== null) {
      if (match.index > lastIndex) parts.push(str.slice(lastIndex, match.index));
      if (match[1] !== undefined) {
        parts.push(
          <strong key={`${keyPrefix}-b${i++}`} className="font-bold text-white">
            {match[1]}
          </strong>
        );
      } else if (match[2] !== undefined) {
        parts.push(
          <em key={`${keyPrefix}-i${i++}`} className="italic text-slate-100">
            {match[2]}
          </em>
        );
      }
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < str.length) parts.push(str.slice(lastIndex));
    return parts;
  };

  return (
    <>
      {text.split('\n').map((line, idx) => {
        if (line === '') return <div key={idx} className="h-1" />;
        if (/^[-•]\s/.test(line)) {
          return (
            <div key={idx} className="flex gap-1.5 ml-0.5 my-0.5">
              <span className="text-emerald-300 mt-0.5 shrink-0">•</span>
              <span>{parseInline(line.replace(/^[-•]\s*/, ''), String(idx))}</span>
            </div>
          );
        }
        return <div key={idx}>{parseInline(line, String(idx))}</div>;
      })}
    </>
  );
}

function getLoadingLabel(input: string): string {
  const t = input.toLowerCase();
  if (t.includes('thực đơn') || t.includes('lên kế hoạch')) return 'Đang tạo thực đơn...';
  if (t.includes('mua sắm') || t.includes('đi chợ')) return 'Đang lập danh sách mua sắm...';
  if (t.includes('tủ lạnh') || t.includes('nguyên liệu')) return 'Đang kiểm tra tủ lạnh...';
  if (t.includes('gợi ý') || t.includes('ăn gì') || t.includes('nấu gì')) return 'AI đang gợi ý món ăn...';
  if (t.includes('calo') || t.includes('tdee')) return 'Đang tính toán calo...';
  if (t.includes('thêm')) return 'Đang thêm dữ liệu...';
  return 'AI đang xử lý yêu cầu...';
}

function normalizeActionMetadata(metadata: any) {
  if (!metadata) return metadata;
  return {
    ...metadata,
    name: metadata.name || metadata.action,
  };
}

const MEAL_PLAN_MUTATION_ACTIONS = new Set([
  'generate_meal_plan',
  'generate_meal_plan_for_days',
  'add_to_meal_plan',
  'replace_meal_item',
  'remove_from_meal_plan',
  'remove_meal_day',
  'delete_meal_plan',
]);

const SHOPPING_LIST_MUTATION_ACTIONS = new Set([
  'generate_shopping_list',
  'create_shopping_list',
  'add_recipe_to_shopping_list',
  'update_shopping_list',
  'delete_shopping_list',
]);

function getActionEntries(action: any): any[] {
  const normalized = normalizeActionMetadata(action);
  if (!normalized) return [];

  const steps = Array.isArray(normalized.steps)
    ? normalized.steps.map(normalizeActionMetadata).filter((step: any) => step?.name)
    : [];

  return [normalized, ...steps].filter((entry: any) => entry?.name);
}

function isSuccessfulAction(action: any) {
  return !action?.result?.error && !action?.error;
}

function inferWeekStartFromAction(action: any) {
  const result = action?.result || {};
  const args = action?.args || {};
  return normalizeWeekStart(result.weekStart || result.mealPlan?.weekStart || args.weekStart);
}

function inferPlanIdFromAction(action: any) {
  const result = action?.result || {};
  const args = action?.args || {};
  return result.id || result.planId || result.mealPlanId || args.planId || args.mealPlanId;
}

function normalizeWeekStart(value: any) {
  if (!value) return undefined;
  return String(value).slice(0, 10);
}

function formatNutritionValue(value: any, suffix = '') {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${Math.round(parsed)}${suffix}` : `0${suffix}`;
}

function mealTypeLabel(mealType: string) {
  if (mealType === 'breakfast') return 'Sáng';
  if (mealType === 'lunch') return 'Trưa';
  if (mealType === 'dinner') return 'Tối';
  return 'Phụ';
}

export default function ChatWidget() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState('AI đang xử lý yêu cầu...');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const suggestions = [
    { text: 'Gợi ý ăn trưa', prompt: 'Gợi ý cho tôi món ăn trưa nay' },
    { text: 'Tạo thực đơn hôm nay', prompt: 'Tạo thực đơn cả 3 bữa cho hôm nay' },
    { text: 'Món ăn lành mạnh', prompt: 'Gợi ý các món ăn lành mạnh ít calo cho tôi' },
    { text: 'Món chống lãng phí', prompt: 'Gợi ý món ăn dùng nguyên liệu sắp hết hạn trong tủ lạnh' },
    { text: 'Tính TDEE & Calo', prompt: 'Tính lượng calo tiêu thụ hằng ngày (TDEE) của tôi' },
    { text: 'Lập danh sách đi chợ', prompt: 'Tạo danh sách mua sắm cho thực đơn hôm nay' },
  ];

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      fetchHistory();
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const getMealPlannerUrlForAction = (action: any) => {
    if (!action?.name) return null;
    if (!['generate_meal_plan', 'generate_meal_plan_for_days', 'add_to_meal_plan'].includes(action.name)) {
      return null;
    }

    const result = action.result || {};
    const args = action.args || {};
    const weekStart = normalizeWeekStart(result.weekStart || args.weekStart);
    const params = new URLSearchParams();
    if (weekStart) params.set('weekStart', weekStart);

    const day = args.dayOfWeek || (Array.isArray(args.days) ? args.days[0] : undefined);
    if (day) params.set('day', String(day));
    if (args.mealType) params.set('meal', args.mealType);

    const mealDate = args.mealDate || (Array.isArray(args.mealDates) ? args.mealDates[0] : undefined);
    if (mealDate) params.set('mealDate', String(mealDate));

    const query = params.toString();
    return query ? `/meal-planner?${query}` : '/meal-planner';
  };

  const normalizeRecipeResults = (result: any) => {
    const source = Array.isArray(result)
      ? result
      : Array.isArray(result?.recommendations)
        ? result.recommendations
        : Array.isArray(result?.data?.recommendations)
          ? result.data.recommendations
          : Array.isArray(result?.data)
            ? result.data
            : [];

    return source.map((item: any) => item?.recipe || item).filter((recipe: any) => recipe && recipe.id);
  };

  const fetchHistory = async () => {
    try {
      const res = await chatbotAPI.getHistory();
      const history = res.data.data.map((m: any) => ({
        role: m.role,
        content: m.content,
        metadata: normalizeActionMetadata(m.metadata),
        createdAt: m.createdAt,
      }));
      setMessages(history);
    } catch (err) {
      console.error('Lỗi khi tải lịch sử chat:', err);
    }
  };

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text) return;

    if (!textToSend) setInput('');

    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setLoadingLabel(getLoadingLabel(text));
    setLoading(true);

    try {
      const res = await chatbotAPI.sendMessage(text);
      const actionTaken = normalizeActionMetadata(res.data.actionTaken);
      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          content: res.data.text,
          metadata: actionTaken,
        },
      ]);

      if (actionTaken?.name) {
        const actionEntries = getActionEntries(actionTaken).filter(isSuccessfulAction);
        const mealPlanEntry = actionEntries.find((entry) => MEAL_PLAN_MUTATION_ACTIONS.has(entry.name));
        const shoppingListEntry = actionEntries.find((entry) => SHOPPING_LIST_MUTATION_ACTIONS.has(entry.name));

        if (mealPlanEntry) {
          notifyMealPlanChanged({
            source: 'chatbot',
            mutation: mealPlanEntry.name,
            weekStart: inferWeekStartFromAction(mealPlanEntry),
            planId: inferPlanIdFromAction(mealPlanEntry),
          });
        }

        if (shoppingListEntry && typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('shopping-list-updated', {
              detail: {
                source: 'chatbot',
                mutation: shoppingListEntry.name,
                updatedAt: Date.now(),
              },
            }),
          );
          toast.success('AI đã cập nhật danh sách mua sắm.', { icon: 'AI', duration: 2000 });
        }

        const mealPlanActions = [
          'generate_meal_plan',
          'add_to_meal_plan',
          'delete_meal_plan',
          'generate_meal_plan_for_days',
          'remove_from_meal_plan',
          'replace_meal_item',
          'remove_meal_day',
        ];
        const otherMutativeActions = ['add_to_inventory', 'update_inventory'];

        if (mealPlanActions.includes(actionTaken.name)) {
          toast.success('AI đã thực hiện thành công! Đang cập nhật thực đơn...', {
            icon: '🤖',
            duration: 2500,
          });
          setTimeout(() => {
            if (typeof window !== 'undefined') {
              const onMealPlannerPage = window.location.pathname.startsWith('/meal-planner');
              if (onMealPlannerPage) {
                return;
              } else {
                window.location.href = getMealPlannerUrlForAction(actionTaken) || '/meal-planner';
              }
            }
          }, 1200);
        } else if (otherMutativeActions.includes(actionTaken.name)) {
          toast.success('AI đã cập nhật dữ liệu thành công!', { icon: '🤖', duration: 2000 });
          if (actionTaken.name === 'add_to_inventory' && typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('inventory-updated', {
                detail: {
                  source: 'chatbot',
                  mutation: actionTaken.name,
                  updatedAt: Date.now(),
                },
              }),
            );
          }
          setTimeout(() => {
            if (typeof window !== 'undefined' && window.location.pathname.startsWith('/inventory')) {
              return;
            }
            window.location.reload();
          }, 1500);
        }
      }
    } catch (err) {
      toast.error('Gửi tin nhắn thất bại');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = async () => {
    if (!window.confirm('Xóa toàn bộ lịch sử trò chuyện? Hành động này không thể hoàn tác.')) return;

    setLoading(true);
    try {
      await chatbotAPI.clearHistory();
      setMessages([]);
      toast.success('Đã xóa lịch sử trò chuyện');
    } catch (err) {
      toast.error('Không thể xóa lịch sử');
    } finally {
      setLoading(false);
    }
  };

  const renderActionResult = (metadata: any): React.ReactNode => {
    if (!metadata) return null;

    if (metadata.steps && Array.isArray(metadata.steps)) {
      return (
        <div className="space-y-3 mt-3">
          {metadata.steps.map((step: any, idx: number) => {
            const visual = renderActionResult(normalizeActionMetadata(step));
            if (!visual) return null;
            return <div key={idx}>{visual}</div>;
          })}
        </div>
      );
    }

    const name = metadata.name || metadata.action;
    const { result } = metadata;
    if (!name || !result || result.error) return null;

    switch (name) {
      case 'get_recommendations':
      case 'search_recipes': {
        const recipes = normalizeRecipeResults(result);
        if (!recipes.length) {
          return (
            <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100">
              Không tìm thấy món ăn phù hợp với nhu cầu hiện tại.
            </div>
          );
        }

        return (
          <div className="mt-3 grid grid-cols-1 gap-2">
            <span className="text-xs font-bold text-emerald-200">Các món ăn tìm thấy:</span>
            <div className="flex flex-col gap-2">
              {recipes.slice(0, 3).map((recipe: any, idx: number) => (
                <div
                  key={recipe.id || `recipe-${idx}`}
                  className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-slate-800 p-2 text-slate-100 shadow-sm transition hover:border-emerald-300/60"
                >
                  {recipe.imageUrl ? (
                    <img
                      src={recipe.imageUrl.startsWith('http') ? recipe.imageUrl : `http://localhost:3001${recipe.imageUrl}`}
                      alt={recipe.name}
                      className="w-12 h-12 rounded-lg object-cover border border-emerald-300/40"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-100 text-lg font-bold">
                      🍳
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-extrabold text-white truncate">{recipe.name}</h4>
                    <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] sm:text-[11px] font-semibold text-slate-200">
                      <span>{formatNutritionValue(recipe.calories)} kcal</span>
                      <span>Đạm {formatNutritionValue(recipe.protein, 'g')}</span>
                      <span>Carbs {formatNutritionValue(recipe.carbs, 'g')}</span>
                      <span>Fat {formatNutritionValue(recipe.fat, 'g')}</span>
                    </div>
                  </div>
                  <Link
                    href={`/recipes/${recipe.id}`}
                    target="_blank"
                    className="text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-white px-3 py-1.5 rounded-lg transition"
                  >
                    Xem
                  </Link>
                </div>
              ))}
            </div>
          </div>
        );
      }

      case 'get_inventory':
      case 'get_expiring_items': {
        const items = result.data;
        if (!items || items.length === 0) return null;

        return (
          <div className="mt-3">
            <span className="text-xs font-bold text-amber-100">Danh sách nguyên liệu trong tủ lạnh:</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {items.slice(0, 8).map((inv: any, idx: number) => {
                const urgency = inv.urgency || 'low';
                const urgencyColors: Record<string, string> = {
                  critical: 'bg-rose-500/20 text-rose-100 border-rose-300/50',
                  high: 'bg-orange-500/20 text-orange-100 border-orange-300/50',
                  medium: 'bg-amber-500/20 text-amber-100 border-amber-300/50',
                  low: 'bg-emerald-500/20 text-emerald-100 border-emerald-300/50',
                };

                return (
                  <span
                    key={inv.id || `inv-${idx}`}
                    className={`text-xs px-2 py-1 rounded-full border ${urgencyColors[urgency]} font-semibold`}
                  >
                    {inv.ingredient?.name || inv.ingredientName || 'Nguyên liệu'} ({inv.quantity} {inv.unit})
                  </span>
                );
              })}
              {items.length > 8 && (
                <span className="text-xs text-slate-300 py-1 font-medium">+ {items.length - 8} nguyên liệu khác</span>
              )}
            </div>
          </div>
        );
      }

      case 'calculate_calories': {
        const mealDist = result.mealDistribution;
        if (!mealDist) return null;

        return (
          <div className="mt-3 p-3 bg-indigo-500/10 rounded-xl border border-indigo-300/30">
            <h4 className="text-xs font-bold text-indigo-100">Chỉ số calo tối ưu hằng ngày:</h4>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              {[
                ['Sáng (30%)', mealDist.breakfast],
                ['Trưa (40%)', mealDist.lunch],
                ['Tối (30%)', mealDist.dinner],
              ].map(([label, value]) => (
                <div key={label} className="p-1.5 bg-slate-800 rounded-lg border border-indigo-300/20">
                  <span className="text-[10px] text-slate-300 block">{label}</span>
                  <span className="text-xs font-bold text-indigo-100">{value} kcal</span>
                </div>
              ))}
            </div>
          </div>
        );
      }

      case 'get_meal_plan':
      case 'generate_meal_plan':
      case 'generate_meal_plan_for_days':
      case 'add_to_meal_plan':
      case 'replace_meal_item':
      case 'remove_from_meal_plan':
      case 'remove_meal_day': {
        let planItems = result.items ? [...result.items] : [];
        if (planItems.length === 0) return null;

        const mealTypeOrder: Record<string, number> = {
          breakfast: 1,
          lunch: 2,
          dinner: 3,
          snack: 4,
        };

        planItems.sort((a: any, b: any) => {
          const dateA = a.mealDate || '';
          const dateB = b.mealDate || '';
          if (dateA !== dateB) return dateA.localeCompare(dateB);
          return (mealTypeOrder[a.mealType] || 99) - (mealTypeOrder[b.mealType] || 99);
        });

        const args = metadata.args || {};
        let filteredItems = planItems;
        let dayLabelText = '';

        if (args.mealDate) {
          filteredItems = planItems.filter((item: any) => item.mealDate === args.mealDate);
          if (filteredItems.length > 0) dayLabelText = `ngày ${filteredItems[0].dayLabel}`;
        } else if (args.mealDates && Array.isArray(args.mealDates) && args.mealDates.length > 0) {
          filteredItems = planItems.filter((item: any) => args.mealDates.includes(item.mealDate));
        } else if (args.dayOfWeek) {
          const dayVal = Number(args.dayOfWeek);
          filteredItems = planItems.filter((item: any) => item.dayOfWeek === dayVal);
          if (filteredItems.length > 0) dayLabelText = `ngày ${filteredItems[0].dayLabel}`;
        } else if (args.days && Array.isArray(args.days) && args.days.length > 0) {
          const dayVals = args.days.map(Number);
          filteredItems = planItems.filter((item: any) => dayVals.includes(item.dayOfWeek));
        } else {
          const today = new Date();
          const formatDigits = (num: number) => String(num).padStart(2, '0');
          const todayStr = `${today.getFullYear()}-${formatDigits(today.getMonth() + 1)}-${formatDigits(today.getDate())}`;
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const tomorrowStr = `${tomorrow.getFullYear()}-${formatDigits(tomorrow.getMonth() + 1)}-${formatDigits(tomorrow.getDate())}`;
          const todayTomorrowItems = planItems.filter((item: any) => item.mealDate === todayStr || item.mealDate === tomorrowStr);

          if (todayTomorrowItems.length > 0) {
            filteredItems = todayTomorrowItems;
            dayLabelText = 'Hôm nay & ngày mai';
          } else {
            filteredItems = planItems.slice(0, 4);
          }
        }

        const displayItems = filteredItems.slice(0, 6);
        const planWeekStart = normalizeWeekStart(result.weekStart || args.weekStart);

        return (
          <div className="mt-3 p-3 bg-blue-500/10 border border-blue-300/30 rounded-xl">
            <span className="text-xs font-bold text-blue-100 flex items-center gap-1.5 mb-2">
              Kế hoạch ăn uống {dayLabelText ? `${dayLabelText}:` : 'tuần này:'}
            </span>
            <div className="flex flex-col gap-1.5">
              {displayItems.map((item: any, idx: number) => (
                <div
                  key={item.id || `item-${idx}`}
                  className="flex justify-between items-center gap-2 p-2 bg-slate-800 border border-blue-300/20 rounded-lg text-xs"
                >
                  <span className="font-bold text-blue-100 w-16">{item.dayLabel}</span>
                  <span className="text-slate-300 capitalize w-14">{mealTypeLabel(item.mealType)}</span>
                  <span className="text-white truncate flex-1 text-right font-semibold">{item.recipe ? item.recipe.name : 'Trống'}</span>
                </div>
              ))}
              {filteredItems.length > 6 && (
                <span className="text-[10px] text-slate-300 text-center block mt-1">
                  ... và {filteredItems.length - 6} bữa ăn khác
                </span>
              )}
            </div>
            <div className="mt-2.5 text-right border-t border-blue-300/20 pt-2">
              <Link
                href={planWeekStart ? `/meal-planner?weekStart=${planWeekStart}` : '/meal-planner'}
                className="text-xs text-blue-100 font-bold hover:text-white hover:underline inline-flex items-center gap-1"
              >
                Đến trang Lịch Ăn →
              </Link>
            </div>
          </div>
        );
      }

      default:
        return null;
    }
  };

  if (!user) return null;

  return (
    <div className="fixed left-4 right-4 bottom-5 sm:left-auto sm:right-5 z-50 flex flex-col items-end bottom-safe pointer-events-none">
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="w-14 h-14 bg-gradient-to-tr from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-105 transition-all duration-300 relative group animate-bounce-subtle cursor-pointer pointer-events-auto"
          title="Trợ lý MealAI"
        >
          <span className="absolute -top-1.5 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500" />
          </span>
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </button>
      )}

      {isOpen && (
        <div
          className="min-h-[360px] bg-slate-950 rounded-2xl shadow-2xl border border-slate-700 flex flex-col overflow-hidden transition-all duration-300 ease-out transform scale-100 animate-slide-in relative pointer-events-auto"
          style={{ width: 'min(380px, calc(100vw - 32px))', maxHeight: '70vh' }}
        >
          <div className="shrink-0 p-3 sm:p-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white flex items-center justify-between shadow-md">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-xl font-bold border border-white/30">
                AI
              </div>
              <div>
                <h3 className="font-extrabold text-sm tracking-wide text-white">Trợ lý MealAI</h3>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-emerald-100 rounded-full animate-pulse" />
                  <span className="text-[11px] text-white font-semibold">AI thông minh đang trực tuyến</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={clearHistory}
                className="w-11 h-11 flex items-center justify-center hover:bg-white/15 rounded-lg text-white transition cursor-pointer"
                aria-label="Clear chat"
                title="Xóa cuộc trò chuyện"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="w-11 h-11 flex items-center justify-center hover:bg-white/15 rounded-lg text-white transition cursor-pointer"
                aria-label="Minimize chat"
                title="Thu gọn chat"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 12h12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 p-4 overflow-y-auto bg-slate-950 flex flex-col gap-3">
            {messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-300">
                <span className="text-5xl mb-3">👋</span>
                <h4 className="font-extrabold text-white text-sm mb-1">Xin chào {user.fullName}!</h4>
                <p className="text-xs max-w-[270px] text-slate-300 leading-relaxed">
                  Tôi là Trợ lý AI có thể giúp bạn kiểm tra tủ lạnh, lên thực đơn tuần, tìm công thức món ăn và lập danh sách đi chợ.
                </p>
              </div>
            ) : (
              messages.map((msg, index) => (
                <div key={index} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl p-3.5 shadow-sm border ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-tr from-emerald-500 to-teal-500 text-white rounded-tr-none border-emerald-400'
                        : 'bg-slate-900 text-slate-100 rounded-tl-none border-slate-700'
                    }`}
                  >
                    <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${msg.role === 'user' ? 'text-white/80' : 'text-emerald-200'}`}>
                      {msg.role === 'user' ? 'Bạn' : 'MealAI Bot'}
                    </p>
                    <div className="text-sm leading-relaxed font-medium text-inherit">
                      {msg.role === 'model' ? renderMarkdown(msg.content) : msg.content}
                    </div>

                    {msg.role === 'model' && renderActionResult(msg.metadata)}

                    {msg.role === 'model' && msg.metadata?.steps && msg.metadata.steps.length > 1 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-700 text-[11px] text-slate-300">
                        <details className="cursor-pointer group">
                          <summary className="font-bold text-emerald-200 hover:text-white list-none flex items-center gap-1 select-none">
                            <span>AI Agent đã thực thi {msg.metadata.steps.length} thao tác</span>
                            <span className="transition-transform group-open:rotate-180 text-[9px]">▼</span>
                          </summary>
                          <div className="mt-2 pl-2 border-l-2 border-emerald-400/70 space-y-1.5 font-medium text-slate-300">
                            {msg.metadata.steps.map((s: any, sidx: number) => (
                              <div key={sidx} className="flex flex-col gap-0.5">
                                <div>
                                  <span className="font-bold text-white">Thao tác {sidx + 1}:</span> chạy lệnh{' '}
                                  <code className="bg-slate-950 px-1 py-0.5 rounded text-[10px] text-pink-200 font-mono">{s.name}</code>
                                </div>
                                {s.result?.message && <div className="text-[10px] text-slate-400 italic pl-3">» {s.result.message}</div>}
                              </div>
                            ))}
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            {loading && (
              <div className="flex items-start gap-2">
                <div className="bg-slate-900 text-slate-100 rounded-2xl rounded-tl-none px-4 py-3 border border-slate-700 shadow-sm flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-emerald-300 rounded-full animate-bounce" />
                    <span className="w-2 h-2 bg-emerald-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <span className="w-2 h-2 bg-emerald-300 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                  <span className="text-[11px] text-emerald-100 font-bold animate-pulse">{loadingLabel}</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="shrink-0 px-4 py-2 bg-slate-950 border-t border-slate-800 flex gap-2 overflow-x-auto scrollbar-none">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => handleSend(s.prompt)}
                disabled={loading}
                className="whitespace-nowrap bg-slate-800 hover:bg-emerald-600 disabled:opacity-60 text-slate-100 hover:text-white border border-slate-600 hover:border-emerald-400 rounded-full px-3 py-1.5 text-xs font-bold shadow-sm transition cursor-pointer"
              >
                {s.text}
              </button>
            ))}
          </div>

          <div className="shrink-0 p-3 bg-slate-900 border-t border-slate-800 flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSend();
              }}
              placeholder="Ví dụ: tạo thực đơn ngày mai, thêm phở bò..."
              disabled={loading}
              className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition disabled:bg-slate-200 disabled:text-slate-500"
            />
            <button
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              className="w-11 h-11 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-400 text-white rounded-xl flex items-center justify-center shadow-md shadow-emerald-500/10 hover:shadow-lg transition-all cursor-pointer shrink-0"
              title="Gửi tin nhắn"
            >
              <svg className="w-5 h-5 transform rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes bounceSubtle {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-4px);
          }
        }
        .animate-slide-in {
          animation: slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-bounce-subtle {
          animation: bounceSubtle 2.5s ease-in-out infinite;
        }
        .scrollbar-none::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-none {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .bottom-safe {
          bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px));
        }
      `}</style>
    </div>
  );
}
