'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { HiChevronLeft, HiChevronRight, HiOutlineTrash, HiOutlineDownload, HiSparkles } from 'react-icons/hi';
import { useAuth } from '@/context/AuthContext';
import api, { mealPlanAPI, recipesAPI, shoppingListAPI, recommendationAPI } from '@/lib/api';

const DAYS = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
const MEALS = [
  { key: 'breakfast', label: 'Sáng' },
  { key: 'lunch',     label: 'Trưa' },
  { key: 'dinner',    label: 'Tối'  },
];

export default function MealPlannerPage() {
  const { user } = useAuth();
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => getInitialWeekStart());
  const [highlightedSlot, setHighlightedSlot] = useState(() => getInitialHighlightedSlot());

  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ itemId: string | null; day: number; mealType: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchingRecipes, setSearchingRecipes] = useState(false);
  const [aiSuggestingDay, setAiSuggestingDay] = useState<number | null>(null);

  useEffect(() => {
    if (user) loadPlan();
    else setLoading(false);
  }, [user, weekStart]);

  // Listen for chatbot AI actions that mutate the meal plan
  useEffect(() => {
    const handler = () => { if (user) loadPlan(); };
    window.addEventListener('mealplan-updated', handler);
    return () => window.removeEventListener('mealplan-updated', handler);
  }, [user, weekStart]);

  useEffect(() => {
    if (!selectorOpen) return;
    const t = setTimeout(() => searchRecipes(), 400);
    return () => clearTimeout(t);
  }, [searchQuery, selectorOpen]);

  const loadPlan = async () => {
    setLoading(true);
    try {
      const res = await mealPlanAPI.get(weekStart);
      setPlan(res.data);
    } catch {
      setPlan(null);
    } finally {
      setLoading(false);
    }
  };

  const exportDayToShoppingList = async (dayOfWeek: number) => {
    if (isPastSlotDate(weekStart, dayOfWeek - 1)) {
      toast.error('Ngày này đã qua, chỉ có thể tạo danh sách cho hôm nay hoặc tương lai.');
      return;
    }
    if (!plan) { toast.error('Vui lòng chọn món ăn trước khi tạo danh sách mua sắm!'); return; }
    try {
      await shoppingListAPI.generate(plan.id, [dayOfWeek]);
      toast.success(`Đã xuất nguyên liệu ${DAYS[dayOfWeek - 1]} sang danh sách đi chợ!`, { duration: 4000 });
      setTimeout(() => { window.location.href = '/shopping-list'; }, 1200);
    } catch { toast.error('Có lỗi xảy ra khi tạo danh sách đi chợ'); }
  };

  // Check if a day has all three mealTypes (breakfast, lunch, dinner) populated with at least one recipe
  const isDayFullyPopulated = (day: number) => {
    if (!plan || !plan.items) return false;
    return MEALS.every((meal) => {
      const items = plan.items.filter((item: any) => item.dayOfWeek === day && item.mealType === meal.key);
      return items.some((item: any) => item.recipeId !== null || item.recipe !== null);
    });
  };

  const handleAISuggestButtonClick = async (dayOfWeek: number) => {
    const isToday = getSlotDateInput(weekStart, dayOfWeek - 1) === getTodayInputValue();
    const dayLabelText = isToday ? 'hôm nay' : `ngày ${DAYS[dayOfWeek - 1]}`;

    if (isDayFullyPopulated(dayOfWeek)) {
      // Case 2: All slots are full
      const confirmed = confirm(
        `Thực đơn ${dayLabelText} đã đầy đủ.\n\nBạn có muốn AI tạo lại toàn bộ thực đơn không?`
      );
      if (!confirmed) return;
      
      // Case 3: Confirmed, run with overwrite = true
      await handleAISuggest(dayOfWeek, true);
    } else {
      // Case 1: Still has empty slots, run with overwrite = false
      await handleAISuggest(dayOfWeek, false);
    }
  };

  // AI gợi ý món ăn theo hồ sơ người dùng, tự động điền các món chính/rau/canh phù hợp khẩu phần ăn
  const handleAISuggest = async (dayOfWeek: number, overwrite = false) => {
    const dateStr = getSlotDateInput(weekStart, dayOfWeek - 1);

    setAiSuggestingDay(dayOfWeek);
    try {
      await mealPlanAPI.generateForDays({
        weekStart,
        days: [dayOfWeek],
        mealDates: [dateStr],
        useAntiWaste: true,
        overwrite,
      });
      toast.success(
        overwrite
          ? `AI đã tạo lại thực đơn cho ngày ${DAYS[dayOfWeek - 1]}! 🤖`
          : `Đã bổ sung món ăn cho các bữa còn thiếu.`
      );
      await loadPlan();
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'Có lỗi khi gọi AI gợi ý';
      toast.error(errMsg);
    } finally {
      setAiSuggestingDay(null);
    }
  };

  const clearDayPlan = async (dayOfWeek: number) => {
    if (isPastSlotDate(weekStart, dayOfWeek - 1)) { toast.error('Không thể chỉnh sửa thực đơn của ngày đã qua.'); return; }
    if (!plan) return;
    const dayItems = plan.items?.filter((item: any) => item.dayOfWeek === dayOfWeek);
    if (!dayItems || dayItems.length === 0) { toast.error('Ngày này chưa có món ăn nào để xóa!'); return; }
    if (!confirm(`Bạn có chắc muốn xóa tất cả món ăn trong ${DAYS[dayOfWeek - 1]}?`)) return;
    try {
      for (const item of dayItems) await mealPlanAPI.removeItem(plan.id, item.id);
      toast.success(`Đã xóa món ăn trong ${DAYS[dayOfWeek - 1]}`);
      loadPlan();
    } catch { toast.error('Có lỗi xảy ra khi xóa'); }
  };

  const handleOpenSelector = (itemId: string | null, day: number, mealType: string) => {
    if (isPastSlotDate(weekStart, day - 1)) { toast.error('Không thể thêm hoặc đổi món cho ngày đã qua.'); return; }
    setSelectedSlot({ itemId, day, mealType });
    setSelectorOpen(true);
    setSearchQuery('');
    fetchInitialRecipes();
  };

  const fetchInitialRecipes = async () => {
    setSearchingRecipes(true);
    try {
      const res = await recipesAPI.getAll({ limit: 12 });
      setSearchResults(res.data?.data || res.data || []);
    } catch { } finally { setSearchingRecipes(false); }
  };

  const searchRecipes = async () => {
    if (!searchQuery) { fetchInitialRecipes(); return; }
    setSearchingRecipes(true);
    try {
      const res = await recipesAPI.getAll({ search: searchQuery, limit: 12 });
      setSearchResults(res.data?.data || res.data || []);
    } catch { } finally { setSearchingRecipes(false); }
  };

  const handleSelectRecipe = async (recipeId: string) => {
    if (!selectedSlot) return;
    if (isPastSlotDate(weekStart, selectedSlot.day - 1)) { toast.error('Không thể thêm hoặc đổi món cho ngày đã qua.'); return; }
    const dateStr = getSlotDateInput(weekStart, selectedSlot.day - 1);
    try {
      if (plan && selectedSlot.itemId) {
        await mealPlanAPI.swapRecipe(plan.id, selectedSlot.itemId, recipeId);
        toast.success('Đã cập nhật món ăn thành công!');
      } else {
        await mealPlanAPI.setMealSlot({ weekStart, dayOfWeek: selectedSlot.day, mealDate: dateStr, mealType: selectedSlot.mealType, recipeId });
        toast.success('Đã chọn món ăn thành công!');
      }
      setHighlightedSlot({ weekStart, day: selectedSlot.day, mealType: selectedSlot.mealType });
      await loadPlan();
      setSelectorOpen(false);
    } catch { toast.error('Không thể cập nhật món ăn'); }
  };

  const handleDeleteItem = async (item: any) => {
    if (!plan) return;
    if (isPastSlotDate(weekStart, item.dayOfWeek - 1)) { toast.error('Không thể xóa món của ngày đã qua.'); return; }
    try {
      await mealPlanAPI.removeItem(plan.id, item.id);
      toast.success('Đã xóa món ăn thành công!');
      loadPlan();
    } catch { toast.error('Không thể xóa món ăn'); }
  };

  const handlePrevWeek = () => {
    const d = parseDateInput(weekStart);
    d.setDate(d.getDate() - 7);
    const prev = formatDateInput(d);
    if (prev < getCurrentWeekStart()) {
      toast.error('Chỉ có thể xem và tạo thực đơn từ tuần hiện tại trở đi.');
      setWeekStart(getCurrentWeekStart());
      return;
    }
    setWeekStart(prev);
  };

  const handleNextWeek = () => {
    const d = parseDateInput(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(formatDateInput(d));
  };

  const getWeekRangeLabel = (startStr: string) => {
    const start = parseDateInput(startStr);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(start.getDate())}/${pad(start.getMonth() + 1)} - ${pad(end.getDate())}/${pad(end.getMonth() + 1)}/${end.getFullYear()}`;
  };

  const getDayDateStr = (startStr: string, dayOffset: number) => {
    const d = parseDateInput(startStr);
    d.setDate(d.getDate() + dayOffset);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const getItemsForSlot = (day: number, mealType: string) =>
    plan?.items?.filter((item: any) => item.dayOfWeek === day && item.mealType === mealType) || [];

  const getMealLabel = (mealType: string) =>
    MEALS.find((m) => m.key === mealType)?.label || 'bữa ăn';

  const getRecipeMeta = (recipe: any, fallbackCalories?: number) => {
    if (recipe?.cookingTime) return `${recipe.cookingTime} phút`;
    if (recipe?.calories || fallbackCalories) return `${recipe?.calories || fallbackCalories} kcal`;
    return null;
  };

  const handleExportPDF = async () => {
    if (!plan) {
      toast.error('Chưa có thực đơn tuần để xuất PDF');
      return;
    }
    const toastId = toast.loading('Đang chuẩn bị file PDF thực đơn...');
    try {
      const res = await api.get(`/meal-plans/${plan.id}/pdf`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = `thuc_don_tuan_${weekStart}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Đã tải xuống file PDF thực đơn thành công!', { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error('Có lỗi xảy ra khi tải file PDF', { id: toastId });
    }
  };

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-500">
          Vui lòng <Link href="/login" className="text-emerald-600 underline">đăng nhập</Link> để sử dụng thực đơn.
        </p>
      </div>
    );
  }

  const canGoPrevWeek = weekStart > getCurrentWeekStart();
  const todayInput = getTodayInputValue();

  return (
    <div className="min-h-screen bg-brand-light-bg">
      <div className="mx-auto max-w-6xl px-4 py-6">

        {/* Page Header with Navigation and Export Button */}
        <div className="card-dashboard mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              📅 Thực Đơn Tuần Của Bạn
            </h1>
            <p className="text-sm text-gray-500 mt-1">Lập lịch ăn uống thông minh, tối ưu calo & dinh dưỡng</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {plan && (
              <button
                onClick={handleExportPDF}
                className="btn-outline-sm gap-2"
              >
                <HiOutlineDownload className="text-base animate-bounce" />
                Xuất PDF Thực Đơn
              </button>
            )}

            {/* Week Navigation */}
            <div className="flex items-center gap-3 bg-slate-50 border border-brand-light-border rounded-brand-sm p-1.5">
              <button
                onClick={handlePrevWeek}
                disabled={!canGoPrevWeek}
                className={`flex h-8 w-8 items-center justify-center rounded-brand-sm border transition-all ${
                  canGoPrevWeek
                    ? 'border-brand-light-border bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer shadow-brand-sm'
                    : 'border-slate-100 text-slate-300 cursor-not-allowed'
                }`}
                aria-label="Tuần trước"
              >
                <HiChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-bold text-slate-700 px-1 min-w-[140px] text-center select-none">
                {getWeekRangeLabel(weekStart)}
              </span>
              <button
                onClick={handleNextWeek}
                className="flex h-8 w-8 items-center justify-center rounded-brand-sm border border-brand-light-border bg-white text-slate-600 transition-all hover:bg-slate-100 hover:text-slate-900 cursor-pointer shadow-brand-sm"
                aria-label="Tuần sau"
              >
                <HiChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-brand-primary" />
              <p className="text-sm">Đang tải thực đơn...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {DAYS.map((dayLabel, dayIdx) => {
              const dayOfWeekNumber = dayIdx + 1;
              const dateStr = getDayDateStr(weekStart, dayIdx);
              const slotDate = getSlotDateInput(weekStart, dayIdx);
              const isPastDay = isPastSlotDate(weekStart, dayIdx);
              const isToday = slotDate === todayInput;

              return (
                <section
                  key={dayLabel}
                  className={`transition-all ${
                    isToday
                      ? 'glass-light border-brand-primary/40 shadow-brand-glow rounded-brand-lg p-5'
                      : 'card-dashboard p-5'
                  } ${isPastDay && !isToday ? 'opacity-70' : ''}`}
                >
                  {/* Day Header */}
                  <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-slate-800">
                        {dayLabel}{' '}
                        <span className="font-normal text-slate-400 text-sm">{dateStr}</span>
                      </h2>
                      {isToday && (
                        <span className="rounded-brand-sm bg-brand-primary px-2 py-0.5 text-xs font-semibold text-white">
                          Hôm nay
                        </span>
                      )}
                    </div>

                    {/* Actions — only show for non-past days */}
                    {!isPastDay && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleAISuggestButtonClick(dayOfWeekNumber)}
                          disabled={aiSuggestingDay === dayOfWeekNumber}
                          className="bg-gradient-to-r from-brand-primary to-brand-secondary text-white font-bold rounded-brand-sm shadow-brand-sm hover:shadow-brand-glow hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs border-none outline-none"
                        >
                          <HiSparkles className={`h-3.5 w-3.5 ${aiSuggestingDay === dayOfWeekNumber ? 'animate-spin' : ''}`} />
                          {aiSuggestingDay === dayOfWeekNumber ? 'Đang gợi ý...' : '✨ AI Gợi Ý'}
                        </button>
                        {plan && (
                          <button
                            onClick={() => exportDayToShoppingList(dayOfWeekNumber)}
                            className="btn-outline-sm"
                          >
                            <HiOutlineDownload className="h-3.5 w-3.5" />
                            Tạo Danh Sách Mua Sắm
                          </button>
                        )}
                        {plan && (
                          <button
                            onClick={() => clearDayPlan(dayOfWeekNumber)}
                            className="flex h-7 w-7 items-center justify-center rounded-brand-sm border border-brand-danger/30 bg-white text-brand-danger hover:bg-brand-danger/10 transition-all cursor-pointer"
                            aria-label="Xóa ngày"
                          >
                            <HiOutlineTrash className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 3 Meal Columns */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {MEALS.map((meal) => {
                      const itemsForSlot = getItemsForSlot(dayOfWeekNumber, meal.key);
                      const isHighlightedSlot =
                        highlightedSlot?.weekStart === weekStart &&
                        highlightedSlot.day === dayOfWeekNumber &&
                        highlightedSlot.mealType === meal.key;

                      return (
                        <div
                          key={meal.key}
                          className={`min-h-[120px] rounded-brand-md border bg-white transition-all ${
                            isHighlightedSlot ? 'border-brand-primary ring-1 ring-brand-primary/30 shadow-brand-glow' : 'border-brand-light-border shadow-brand-sm'
                          }`}
                        >
                          {/* Meal Column Header */}
                          <div className="flex items-center justify-between border-b border-brand-light-border px-3 py-2">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{meal.label}</span>
                            {!isPastDay && (
                              <button
                                onClick={() => handleOpenSelector(null, dayOfWeekNumber, meal.key)}
                                className="flex items-center gap-0.5 text-xs font-bold text-brand-primary hover:text-brand-primary-hover transition-all cursor-pointer"
                              >
                                <span className="text-sm leading-none">+</span>
                                <span>Thêm món</span>
                              </button>
                            )}
                          </div>

                          {/* Slot Content */}
                          <div className="p-2 space-y-2">
                            {itemsForSlot.length === 0 ? (
                              <div className="flex min-h-[72px] items-center justify-center">
                                <p className="text-xs text-slate-300">Chưa có món ăn</p>
                              </div>
                            ) : (
                              itemsForSlot.map((item: any) => (
                                <div
                                  key={item.id}
                                  className="group relative rounded-brand-sm border border-brand-primary/20 bg-emerald-50/5 p-2 hover:bg-emerald-50/15 hover:border-brand-primary/45 transition-all shadow-brand-sm"
                                >
                                  {/* Consumed Checkbox */}
                                  <div className="absolute top-2 right-2 z-10">
                                    <input 
                                      type="checkbox"
                                      checked={!!item.isConsumed}
                                      onChange={async (e) => {
                                        const newChecked = e.target.checked;
                                        try {
                                          await mealPlanAPI.toggleConsume(plan.id, item.id, newChecked);
                                          if (newChecked) {
                                            toast.success(`Đã hoàn thành ${item.recipe?.name || 'bữa ăn'} & tự động trừ nguyên liệu tủ lạnh!`);
                                          } else {
                                            toast.success(`Đã hoàn tác hoàn thành ${item.recipe?.name || 'bữa ăn'} & hoàn lại nguyên liệu!`);
                                          }
                                          // Dispatch event to notify inventory changes
                                          window.dispatchEvent(new CustomEvent('inventory-updated'));
                                          // Reload plan to get updated isConsumed status
                                          loadPlan();
                                        } catch (err: any) {
                                          console.error(err);
                                          toast.error(err.response?.data?.message || 'Có lỗi xảy ra khi cập nhật trạng thái bữa ăn');
                                        }
                                      }}
                                      className="w-3.5 h-3.5 rounded-full text-emerald-600 border-gray-300 focus:ring-emerald-500 cursor-pointer"
                                      title="Đánh dấu hoàn thành bữa ăn"
                                    />
                                  </div>

                                  <div className="flex items-center gap-2">
                                    {/* Recipe Image */}
                                    <Link href={`/recipes/${item.recipe?.id}`} className="shrink-0">
                                      <div className="h-10 w-10 overflow-hidden rounded-brand-sm border border-brand-light-border bg-slate-100">
                                        {item.recipe?.imageUrl ? (
                                          <img
                                            src={
                                              item.recipe.imageUrl.startsWith('http')
                                                ? item.recipe.imageUrl
                                                : `http://localhost:3001${item.recipe.imageUrl}`
                                            }
                                            alt={item.recipe.name}
                                            className="h-full w-full object-cover"
                                          />
                                        ) : (
                                          <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">Ảnh</div>
                                        )}
                                      </div>
                                    </Link>

                                    {/* Recipe Info */}
                                    <div className="min-w-0 flex-1 pr-5">
                                      <Link href={`/recipes/${item.recipe?.id}`}>
                                        <p className="truncate text-xs font-semibold text-slate-800 hover:text-brand-primary transition-all">
                                          {item.recipe?.name || 'Món ăn'}
                                        </p>
                                      </Link>
                                      {getRecipeMeta(item.recipe, item.calories) && (
                                        <p className="text-[10px] text-slate-400">
                                          • {getRecipeMeta(item.recipe, item.calories)}
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  {/* Item Actions */}
                                  {!isPastDay && (
                                    <div className="mt-1.5 flex gap-1">
                                      <button
                                        onClick={() => handleOpenSelector(item.id, dayOfWeekNumber, meal.key)}
                                        className="flex-1 rounded-brand-sm border border-brand-primary/30 py-1 text-[10px] font-bold text-brand-primary hover:bg-brand-primary/10 transition-all cursor-pointer"
                                      >
                                        Đổi
                                      </button>
                                      <button
                                        onClick={() => handleDeleteItem(item)}
                                        className="flex-1 rounded-brand-sm border border-brand-danger/30 py-1 text-[10px] font-bold text-brand-danger hover:bg-brand-danger/10 transition-all cursor-pointer"
                                      >
                                        Xóa
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {/* Recipe Selector Modal */}
        {selectorOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-brand-lg bg-white shadow-brand-lg border border-brand-light-border">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-brand-light-border px-5 py-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Chọn món — {selectedSlot ? `${getMealLabel(selectedSlot.mealType)}, ${DAYS[selectedSlot.day - 1]}` : ''}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">Tìm và chọn công thức muốn thêm vào thực đơn.</p>
                </div>
                <button
                  onClick={() => setSelectorOpen(false)}
                  className="btn-ghost-sm"
                >
                  Đóng
                </button>
              </div>

              {/* Search */}
              <div className="border-b border-brand-light-border px-5 py-3 bg-slate-50/50">
                <input
                  type="text"
                  placeholder="Nhập tên món ăn để tìm kiếm..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-brand-sm border border-brand-light-border bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/10 shadow-brand-sm"
                  autoFocus
                />
              </div>

              {/* Results */}
              <div className="flex-1 overflow-y-auto bg-slate-50/30 p-5">
                {searchingRecipes && searchResults.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                    <div className="mb-3 h-7 w-7 animate-spin rounded-full border-b-2 border-brand-primary" />
                    <p className="text-sm">Đang tìm công thức...</p>
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    <p className="text-sm font-medium">Không tìm thấy món ăn phù hợp</p>
                    <p className="mt-1 text-xs">Hãy thử tên món khác.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {searchResults.map((recipe: any) => (
                      <div
                        key={recipe.id}
                        className="flex items-center justify-between gap-3 rounded-brand-md border border-brand-light-border bg-white p-3 shadow-brand-sm transition hover:border-brand-primary/30 hover:shadow-brand-md"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-brand-sm border border-brand-light-border bg-slate-100">
                            {recipe.imageUrl ? (
                              <img
                                src={recipe.imageUrl.startsWith('http') ? recipe.imageUrl : `http://localhost:3001${recipe.imageUrl}`}
                                alt={recipe.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-gray-100 text-xs text-gray-400">Ảnh</div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-800">{recipe.name}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {recipe.calories ? `${recipe.calories} kcal` : ''}
                              {recipe.cookingTime ? ` · ${recipe.cookingTime} phút` : ''}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleSelectRecipe(recipe.id)}
                          className="btn-primary-sm shrink-0"
                        >
                          Chọn
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="border-t border-brand-light-border px-5 py-3 text-right">
                <button
                  onClick={() => setSelectorOpen(false)}
                  className="btn-ghost-sm inline-flex"
                >
                  Hủy bỏ
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Helpers ─── */
function getInitialWeekStart(): string {
  const currentWeekStart = getCurrentWeekStart();
  if (typeof window !== 'undefined') {
    const weekStart = new URLSearchParams(window.location.search).get('weekStart');
    if (isDateInputValue(weekStart) && weekStart >= currentWeekStart) return weekStart;
  }
  return currentWeekStart;
}

function getInitialHighlightedSlot(): { weekStart: string; day: number; mealType: string } | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const weekStart = params.get('weekStart');
  const day = Number(params.get('day'));
  const mealType = params.get('meal');
  if (!isDateInputValue(weekStart)) return null;
  if (!Number.isInteger(day) || day < 1 || day > 7) return null;
  if (!mealType || !MEALS.some((m) => m.key === mealType)) return null;
  if (weekStart < getCurrentWeekStart() || isPastSlotDate(weekStart, day - 1)) return null;
  return { weekStart, day, mealType };
}

function isDateInputValue(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
function parseDateInput(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}
function formatDateInput(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function getTodayInputValue(): string { return formatDateInput(new Date()); }
function getCurrentWeekStart(): string { return getMonday(new Date()); }
function getSlotDateInput(startStr: string, dayOffset: number): string {
  const start = parseDateInput(startStr);
  start.setDate(start.getDate() + dayOffset);
  return formatDateInput(start);
}
function isPastSlotDate(startStr: string, dayOffset: number): boolean {
  return getSlotDateInput(startStr, dayOffset) < getTodayInputValue();
}
function getMonday(d: Date): string {
  const target = new Date(d);
  const day = target.getDay();
  const diff = target.getDate() - day + (day === 0 ? -6 : 1);
  target.setDate(diff);
  return formatDateInput(target);
}
