'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { chatbotAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';

interface Message {
  id?: string;
  role: 'user' | 'model';
  content: string;
  metadata?: {
    action?: string;
    result?: any;
    steps?: any[];
  };
  createdAt?: string;
}

// Simple inline markdown renderer: supports **bold**, *italic*, and - lists
function renderMarkdown(text: string | null | undefined): React.ReactNode {
  if (!text || text.trim() === '') {
    return <span className="italic text-gray-400 text-xs">(Không có phản hồi)</span>;
  }
  const lines = text.split('\n');

  const parseInline = (str: string, keyPrefix: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    const regex = /\*\*(.*?)\*\*|\*(.*?)\*/g;
    let lastIndex = 0;
    let match;
    let i = 0;
    while ((match = regex.exec(str)) !== null) {
      if (match.index > lastIndex) parts.push(str.slice(lastIndex, match.index));
      if (match[1] !== undefined)
        parts.push(<strong key={`${keyPrefix}-b${i++}`} className="font-bold">{match[1]}</strong>);
      else if (match[2] !== undefined)
        parts.push(<em key={`${keyPrefix}-i${i++}`} className="italic">{match[2]}</em>);
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < str.length) parts.push(str.slice(lastIndex));
    return parts;
  };

  return (
    <>
      {lines.map((line, idx) => {
        if (line === '') return <div key={idx} className="h-1" />;
        if (/^[-•]\s/.test(line)) {
          return (
            <div key={idx} className="flex gap-1.5 ml-0.5 my-0.5">
              <span className="text-emerald-400 mt-0.5 shrink-0">•</span>
              <span>{parseInline(line.replace(/^[-•]\s*/, ''), String(idx))}</span>
            </div>
          );
        }
        return <div key={idx}>{parseInline(line, String(idx))}</div>;
      })}
    </>
  );
}

// Detect what action the user is requesting to show contextual loading text
function getLoadingLabel(input: string): string {
  const t = input.toLowerCase();
  if (t.includes('thực đơn') || t.includes('lên kế hoạch')) return '🗓️ Đang tạo thực đơn...';
  if (t.includes('mua sắm') || t.includes('đi chợ')) return '🛒 Đang lập danh sách mua sắm...';
  if (t.includes('tủ lạnh') || t.includes('nguyên liệu')) return '🥦 Đang kiểm tra tủ lạnh...';
  if (t.includes('gợi ý') || t.includes('ăn gì') || t.includes('nấu gì')) return '💡 AI đang gợi ý món ăn...';
  if (t.includes('calo') || t.includes('tdee')) return '⚖️ Đang tính toán calo...';
  if (t.includes('thêm')) return '➕ Đang thêm dữ liệu...';
  return '🤖 AI đang xử lý yêu cầu...';
}

export default function ChatWidget() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState('🤖 AI đang xử lý yêu cầu...');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Quick action suggestions
  const suggestions = [
    { text: '🔍 Gợi ý ăn trưa', prompt: 'Gợi ý cho tôi món ăn trưa nay' },
    { text: '📅 Tạo thực đơn hôm nay', prompt: 'Tạo thực đơn cả 3 bữa cho hôm nay' },
    { text: '🥗 Món ăn lành mạnh', prompt: 'Gợi ý các món ăn lành mạnh ít calo cho tôi' },
    { text: '🥦 Món chống lãng phí', prompt: 'Gợi ý món ăn dùng nguyên liệu sắp hết hạn trong tủ lạnh' },
    { text: '🔥 Tính TDEE & Calo', prompt: 'Tính lượng calo tiêu thụ hàng ngày (TDEE) của tôi' },
    { text: '🛒 Lập danh sách đi chợ', prompt: 'Tạo danh sách mua sắm cho thực đơn hôm nay' },
  ];


  // Fetch history when opening
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      fetchHistory();
    }
  }, [isOpen]);


  // Scroll to bottom on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const normalizeActionMetadata = (metadata: any) => {
    if (!metadata) return metadata;
    return {
      ...metadata,
      name: metadata.name || metadata.action,
    };
  };

  const normalizeWeekStart = (value: any) => {
    if (!value) return undefined;
    return String(value).slice(0, 10);
  };

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
    const source =
      Array.isArray(result)
        ? result
        : Array.isArray(result?.recommendations)
          ? result.recommendations
          : Array.isArray(result?.data?.recommendations)
            ? result.data.recommendations
            : Array.isArray(result?.data)
              ? result.data
              : [];

    return source
      .map((item: any) => item?.recipe || item)
      .filter((recipe: any) => recipe && recipe.id);
  };

  const formatNutritionValue = (value: any, suffix = '') => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? `${Math.round(parsed)}${suffix}` : `0${suffix}`;
  };

  const fetchHistory = async () => {
    try {
      const res = await chatbotAPI.getHistory();
      // Map API history data
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

    // Append user message immediately
    const userMsg: Message = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setLoadingLabel(getLoadingLabel(text));
    setLoading(true);

    try {
      const res = await chatbotAPI.sendMessage(text);
      console.log('[MealAI][chatbot] raw response:', res.data);
      if (res.data?.actionTaken?.name === 'get_recommendations') {
        console.log('[MealAI][chatbot][recommendations] result:', res.data.actionTaken.result);
      }
      const assistantMsg: Message = {
        role: 'model',
        content: res.data.text,
        metadata: res.data.actionTaken,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // If AI performed a mutation action, sync UI live
      if (res.data.actionTaken && res.data.actionTaken.name) {
        const actionName = res.data.actionTaken.name;
        const mealPlanActions = [
          'generate_meal_plan',
          'add_to_meal_plan',
          'delete_meal_plan',
          'generate_meal_plan_for_days',
          'remove_from_meal_plan',
        ];
        const otherMutativeActions = ['add_to_inventory', 'update_inventory', 'generate_shopping_list'];

        if (mealPlanActions.includes(actionName)) {
          toast.success('✨ AI đã thực hiện thành công! Đang cập nhật thực đơn...', { icon: '🤖', duration: 2500 });
          setTimeout(() => {
            if (typeof window !== 'undefined') {
              const onMealPlannerPage = window.location.pathname.startsWith('/meal-planner');
              if (onMealPlannerPage) {
                // Dispatch custom event — meal planner page listens and reloads plan data
                window.dispatchEvent(new CustomEvent('mealplan-updated', {
                  detail: res.data.actionTaken
                }));
              } else {
                const targetUrl = getMealPlannerUrlForAction(res.data.actionTaken);
                window.location.href = targetUrl || '/meal-planner';
              }
            }
          }, 1200);
        } else if (otherMutativeActions.includes(actionName)) {
          toast.success('✨ AI đã cập nhật dữ liệu thành công!', { icon: '🤖', duration: 2000 });
          setTimeout(() => { window.location.reload(); }, 1500);
        }
      }
    } catch (err: any) {
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

  // Renders beautiful custom interactive elements based on backend API results
  const renderActionResult = (metadata: any): React.ReactNode => {
    if (!metadata) return null;

    // Support multi-step execution logs rendering in sequence recursively
    if (metadata.steps && Array.isArray(metadata.steps)) {
      return (
        <div className="space-y-3 mt-3">
          {metadata.steps.map((step: any, idx: number) => {
            const visual = renderActionResult(step);
            if (!visual) return null;
            return <div key={idx}>{visual}</div>;
          })}
        </div>
      );
    }

    if (!(metadata.name || metadata.action)) return null;

    const name = metadata.name || metadata.action;
    const { result } = metadata;
    if (!result || result.error) return null;

    switch (name) {
      case 'get_recommendations':
      case 'search_recipes':
        const recipes = normalizeRecipeResults(result);
        console.log('[MealAI][chatbot][recipes normalized]:', recipes);
        if (!recipes || recipes.length === 0) {
          return (
            <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
              Không tìm thấy món ăn phù hợp với nhu cầu hiện tại.
            </div>
          );
        }
        return (
          <div className="mt-3 grid grid-cols-1 gap-2">
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              💡 Các món ăn tìm thấy:
            </span>
            <div className="flex flex-col gap-2">
              {recipes.slice(0, 3).map((recipe: any, idx: number) => (
                <div 
                  key={recipe.id || `recipe-${idx}`} 
                  className="flex items-center gap-3 p-2 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg border border-emerald-100 dark:border-emerald-900/30 hover:shadow-sm transition"
                >
                  {recipe.imageUrl ? (
                    <img 
                      src={recipe.imageUrl.startsWith('http') ? recipe.imageUrl : `http://localhost:3001${recipe.imageUrl}`} 
                      alt={recipe.name} 
                      className="w-12 h-12 rounded-md object-cover border border-emerald-200"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900 rounded-md flex items-center justify-center text-emerald-600 text-lg font-bold">
                      🍳
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">{recipe.name}</h4>
                    <div className="mt-1 grid grid-cols-2 gap-x-1 gap-y-0.5 text-[10px] sm:text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                      <span>🔥 {formatNutritionValue(recipe.calories)} kcal</span>
                      <span>Đạm {formatNutritionValue(recipe.protein, 'g')}</span>
                      <span>Carbs {formatNutritionValue(recipe.carbs, 'g')}</span>
                      <span>Fat {formatNutritionValue(recipe.fat, 'g')}</span>
                    </div>
                  </div>
                  <Link 
                    href={`/recipes/${recipe.id}`}
                    target="_blank"
                    className="text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white px-2.5 py-1.5 rounded-md transition"
                  >
                    Xem
                  </Link>
                </div>
              ))}
            </div>
          </div>
        );

      case 'get_inventory':
      case 'get_expiring_items':
        const items = result.data;
        if (!items || items.length === 0) return null;
        return (
          <div className="mt-3">
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
              🥦 Danh sách nguyên liệu trong tủ lạnh:
            </span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {items.slice(0, 8).map((inv: any, idx: number) => {
                const urgency = inv.urgency || 'low';
                const urgencyColors: Record<string, string> = {
                  critical: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400',
                  high: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400',
                  medium: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400',
                  low: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400',
                };
                return (
                  <span 
                    key={inv.id || `inv-${idx}`} 
                    className={`text-xs px-2 py-1 rounded-full border ${urgencyColors[urgency]} font-medium`}
                  >
                    {inv.ingredient.name} ({inv.quantity} {inv.unit})
                  </span>
                );
              })}
              {items.length > 8 && (
                <span className="text-xs text-gray-500 py-1 font-medium">
                  + {items.length - 8} nguyên liệu khác
                </span>
              )}
            </div>
          </div>
        );

      case 'calculate_calories':
        const mealDist = result.mealDistribution;
        if (!mealDist) return null;
        return (
          <div className="mt-3 p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl border border-indigo-100 dark:border-indigo-900/30">
            <h4 className="text-xs font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
              ⚖️ Chỉ số calo tối ưu hàng ngày:
            </h4>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div className="p-1.5 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-indigo-100/50">
                <span className="text-[10px] text-gray-500 block">Sáng (30%)</span>
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{mealDist.breakfast} kcal</span>
              </div>
              <div className="p-1.5 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-indigo-100/50">
                <span className="text-[10px] text-gray-500 block">Trưa (40%)</span>
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{mealDist.lunch} kcal</span>
              </div>
              <div className="p-1.5 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-indigo-100/50">
                <span className="text-[10px] text-gray-500 block">Tối (30%)</span>
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{mealDist.dinner} kcal</span>
              </div>
            </div>
          </div>
        );

      case 'get_meal_plan':
      case 'generate_meal_plan':
      case 'generate_meal_plan_for_days':
      case 'add_to_meal_plan':
        const planItems = result.items;
        if (!planItems || planItems.length === 0) return null;
        const planWeekStart = normalizeWeekStart(result.weekStart);
        return (
          <div className="mt-3">
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
              📅 Kế hoạch ăn uống:
            </span>
            <div className="mt-1 flex flex-col gap-1.5">
              {planItems.slice(0, 4).map((item: any, idx: number) => (
                <div key={item.id || `item-${idx}`} className="flex justify-between items-center p-2 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100/50 rounded-lg text-xs">
                  <span className="font-bold text-blue-800 dark:text-blue-400 w-16">{item.dayLabel}</span>
                  <span className="text-gray-500 dark:text-gray-400 capitalize w-14">{item.mealType === 'breakfast' ? 'Sáng' : item.mealType === 'lunch' ? 'Trưa' : 'Tối'}</span>
                  <span className="text-gray-800 dark:text-gray-200 truncate flex-1 text-right font-medium">{item.recipe ? item.recipe.name : 'Trống'}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 text-right">
              <Link 
                href={planWeekStart ? `/meal-planner?weekStart=${planWeekStart}` : '/meal-planner'}
                className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline inline-flex items-center gap-1"
              >
                Đến trang Lịch Ăn ➔
              </Link>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (!user) return null;

  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:bottom-6 sm:right-6 z-50 flex flex-col items-end bottom-safe pointer-events-none">
      {/* Floating Chat Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="w-14 h-14 bg-gradient-to-tr from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-105 transition-all duration-300 relative group animate-bounce-subtle cursor-pointer pointer-events-auto"
          title="Trợ lý MealAI"
        >
          <span className="absolute -top-1.5 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
          </span>
          <svg
            className="w-7 h-7"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            ></path>
          </svg>
        </button>
      )}

      {/* Chat Window Panel */}
      {isOpen && (
        <div className="w-full sm:w-[420px] h-[80vh] sm:h-[600px] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 flex flex-col overflow-hidden transition-all duration-300 ease-out transform scale-100 animate-slide-in relative pointer-events-auto">

          {/* Header */}
          <div className="p-3 sm:p-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white flex items-center justify-between shadow-md">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-xl font-bold border border-white/20">
                🤖
              </div>
              <div>
                <h3 className="font-bold text-sm tracking-wide">Trợ lý MealAI</h3>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-emerald-300 rounded-full animate-pulse"></span>
                  <span className="text-[11px] text-emerald-100 font-medium">AI thông minh đang trực tuyến</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={clearHistory}
                className="w-11 h-11 flex items-center justify-center hover:bg-white/10 rounded-lg text-emerald-100 hover:text-white transition cursor-pointer"
                title="Xóa cuộc trò chuyện"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  ></path>
                </svg>
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="w-11 h-11 flex items-center justify-center hover:bg-white/10 rounded-lg text-emerald-100 hover:text-white transition cursor-pointer"
                title="Đóng chat"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M6 18L18 6M6 6l12 12"
                  ></path>
                </svg>
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 p-4 overflow-y-auto bg-gray-50 dark:bg-gray-950 flex flex-col gap-3">
            {messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-gray-400 dark:text-gray-500">
                <span className="text-5xl mb-3">👋</span>
                <h4 className="font-bold text-gray-700 dark:text-gray-300 text-sm mb-1">
                  Xin chào {user.fullName}!
                </h4>
                <p className="text-xs max-w-[260px]">
                  Tôi là Trợ lý AI có thể giúp bạn kiểm tra tủ lạnh, lên thực đơn tuần, tìm công thức món ăn và lập danh sách đi chợ!
                </p>
              </div>
            ) : (
              messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex flex-col ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl p-3.5 shadow-sm border ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-tr from-emerald-500 to-teal-500 text-white rounded-tr-none border-emerald-500'
                        : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-tl-none border-gray-100 dark:border-gray-700/50'
                    }`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wider opacity-60 mb-1">
                      {msg.role === 'user' ? 'Bạn' : 'MealAI Bot'}
                    </p>
                    <div className="text-sm leading-relaxed font-medium">
                      {msg.role === 'model' ? renderMarkdown(msg.content) : msg.content}
                    </div>

                    {/* Render visual elements from function call metadata */}
                    {msg.role === 'model' && renderActionResult(msg.metadata)}

                    {/* Collapsible Agent Execution Trace */}
                    {msg.role === 'model' && msg.metadata?.steps && msg.metadata.steps.length > 1 && (
                      <div className="mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-700/50 text-[11px] text-gray-400">
                        <details className="cursor-pointer group">
                          <summary className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline list-none flex items-center gap-1 select-none">
                            <span>🤖 AI Agent đã thực thi {msg.metadata.steps.length} thao tác</span>
                            <span className="transition-transform group-open:rotate-180 text-[9px]">▼</span>
                          </summary>
                          <div className="mt-2 pl-2 border-l-2 border-emerald-300 dark:border-emerald-700 space-y-1.5 font-medium text-gray-500 dark:text-gray-400">
                            {msg.metadata.steps.map((s: any, sidx: number) => (
                              <div key={sidx} className="flex flex-col gap-0.5">
                                <div>
                                  <span className="font-bold text-gray-700 dark:text-gray-300">Thao tác {sidx + 1}:</span> chạy lệnh <code className="bg-gray-100 dark:bg-gray-900 px-1 py-0.5 rounded text-[10px] text-pink-600 font-mono">{s.name}</code>
                                </div>
                                {s.result && s.result.message && (
                                  <div className="text-[10px] text-gray-400 italic pl-3">&raquo; {s.result.message}</div>
                                )}
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

            {/* Loading / Typing Indicator */}
            {loading && (
              <div className="flex items-start gap-2">
                <div className="bg-white dark:bg-gray-800 text-gray-500 rounded-2xl rounded-tl-none px-4 py-3 border border-gray-100 dark:border-gray-700/50 shadow-sm flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"></span>
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                  </div>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold animate-pulse">
                    {loadingLabel}
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Action Suggestions Panel */}
          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-950 border-t border-gray-100 dark:border-gray-800 flex gap-2 overflow-x-auto scrollbar-none">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => handleSend(s.prompt)}
                disabled={loading}
                className="whitespace-nowrap bg-white hover:bg-emerald-50 dark:bg-gray-800 dark:hover:bg-emerald-950 text-gray-700 hover:text-emerald-700 dark:text-gray-300 dark:hover:text-emerald-400 border border-gray-200 dark:border-gray-700 hover:border-emerald-200 dark:hover:border-emerald-900 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm transition cursor-pointer"
              >
                {s.text}
              </button>
            ))}
          </div>

          {/* Input Footer */}
          <div className="p-3 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSend();
              }}
              placeholder="Ví dụ: tạo thực đơn ngày mai, thêm phở bò..."
              disabled={loading}
              className="flex-1 bg-gray-50 dark:bg-gray-955 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
            />
            <button
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              className="w-11 h-11 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl flex items-center justify-center shadow-md shadow-emerald-500/10 hover:shadow-lg transition-all cursor-pointer shrink-0"
            >
              <svg
                className="w-5 h-5 transform rotate-90"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                ></path>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Global CSS Inject for simple custom animations and safe area bottom positioning */}
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
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes bounceSubtle {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-4px);
          }
        }
        .animate-slide-in {
          animation: slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-fade-in {
          animation: fadeIn 0.2s ease-out forwards;
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
