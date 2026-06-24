'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  HiCalendar,
  HiChevronLeft,
  HiChevronRight,
  HiEye,
  HiFilter,
  HiHeart,
  HiSearch,
  HiShoppingBag,
  HiX,
} from 'react-icons/hi';

import RecipeImage from '@/components/RecipeImage';
import MealLimitWarningModal from '@/components/MealLimitWarningModal';
import { useAuth } from '@/context/AuthContext';
import { favoritesAPI, mealPlanAPI, shoppingListAPI } from '@/lib/api';
import { getMaxRecommendedDishes, getMealSlotLimit } from '@/lib/mealPortion';
import {
  formatDateInput,
  getFirstAvailableMeal,
  getMealPlanDay,
  getMonday,
  getTodayInputValue,
  isPastMealDate,
  isPastMealSlot,
  parseDateInput,
  validateAddRecipeToMealPlan,
  type MealType,
} from '@/lib/meal-plan-utils';

type FavoriteItem = {
  id: string;
  name: string;
  imageUrl?: string | null;
  cuisineRegion?: string | null;
  calories?: number | null;
  cookingTime?: number | null;
  favoritedAt: string;
};

type ApiError = {
  response?: {
    status?: number;
    data?: {
      message?: string;
    };
  };
  message?: string;
};

const MEAL_OPTIONS: Array<{
  key: MealType;
  label: string;
  icon: string;
  bg: string;
  border: string;
  text: string;
  selected: string;
}> = [
  {
    key: 'breakfast',
    label: 'Sáng',
    icon: '☕',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-600',
    selected: 'ring-orange-300 border-orange-400 bg-orange-50',
  },
  {
    key: 'lunch',
    label: 'Trưa',
    icon: '☀️',
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-600',
    selected: 'ring-yellow-300 border-yellow-400 bg-yellow-50',
  },
  {
    key: 'dinner',
    label: 'Tối',
    icon: '🌙',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-600',
    selected: 'ring-blue-300 border-blue-400 bg-blue-50',
  },
];

export default function FavoritesPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [categoryStats, setCategoryStats] = useState<Record<string, number>>({});
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [activeSearch, setActiveSearch] = useState('');

  const [plannerModal, setPlannerModal] = useState({
    isOpen: false,
    recipeId: '',
    recipeName: '',
  });
  const [selectedDate, setSelectedDate] = useState(() => formatDateInput(new Date()));
  const [selectedMeal, setSelectedMeal] = useState<MealType>('breakfast');
  const [submittingMealPlan, setSubmittingMealPlan] = useState(false);
  const [portionWarning, setPortionWarning] = useState<{
    servings: number;
    currentDayItemsCount: number;
    maxRecommendedItems: number;
    recipeName: string;
    weekStart: string;
    dayOfWeek: number;
  } | null>(null);

  useEffect(() => {
    if (plannerModal.isOpen && selectedDate) {
      setSelectedMeal(getFirstAvailableMeal(selectedDate));
    }
  }, [selectedDate, plannerModal.isOpen]);

  const loadFavorites = async (
    targetPage = page,
    targetSearch = activeSearch,
    targetCategory = selectedCategory
  ) => {
    setLoading(true);
    try {
      const res = await favoritesAPI.getAll({
        page: targetPage,
        limit: 6,
        search: targetSearch || undefined,
        category: targetCategory || undefined,
      });

      setFavorites(res.data.data || []);
      setTotalCount(res.data.totalFavorites || 0);
      setCategoryStats(res.data.categoryStats || {});
      setTotalPages(res.data.meta.totalPages || 1);
    } catch (err: unknown) {
      const error = err as ApiError;
      console.error('Load favorites failed:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });
      toast.error(error.response?.data?.message || 'Không thể tải danh sách yêu thích');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const syncFavorites = async () => {
      setLoading(true);
      try {
        const res = await favoritesAPI.getAll({
          page,
          limit: 6,
          search: activeSearch || undefined,
          category: selectedCategory || undefined,
        });

        if (cancelled) return;

        setFavorites(res.data.data || []);
        setTotalCount(res.data.totalFavorites || 0);
        setCategoryStats(res.data.categoryStats || {});
        setTotalPages(res.data.meta.totalPages || 1);
      } catch (err: unknown) {
        if (cancelled) return;

        const error = err as ApiError;
        console.error('Load favorites failed:', {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message,
        });
        toast.error(error.response?.data?.message || 'Không thể tải danh sách yêu thích');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void syncFavorites();

    return () => {
      cancelled = true;
    };
  }, [page, activeSearch, selectedCategory]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setActiveSearch(search);
  };

  const handleCategorySelect = (category: string) => {
    setPage(1);
    setSelectedCategory(category === selectedCategory ? '' : category);
  };

  const handleUnfavorite = async (id: string) => {
    try {
      await favoritesAPI.remove(id);
      toast.success('Đã bỏ yêu thích món ăn');

      if (favorites.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        loadFavorites();
      }
    } catch (err: unknown) {
      const error = err as ApiError;
      console.error('Remove favorite failed:', {
        recipeId: id,
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });
      toast.error(error.response?.data?.message || 'Không thể bỏ yêu thích');
    }
  };

  const handleAddToShoppingList = async (id: string) => {
    const loadingToast = toast.loading('Đang tạo danh sách mua sắm...');

    try {
      await shoppingListAPI.addRecipeToList(id);
      toast.dismiss(loadingToast);
      toast.success(
        <div>
          Đã tạo danh sách mua sắm từ nguyên liệu món ăn!{' '}
          <Link href="/shopping-list" className="font-semibold text-emerald-700 underline">
            Xem đi chợ
          </Link>
        </div>,
        { duration: 5000 }
      );
    } catch {
      toast.dismiss(loadingToast);
      toast.error('Không thể tạo danh sách mua sắm');
    }
  };

  const closePlannerModal = () => {
    setPlannerModal({
      isOpen: false,
      recipeId: '',
      recipeName: '',
    });
    setSelectedDate(formatDateInput(new Date()));
    setSelectedMeal('breakfast');
    setSubmittingMealPlan(false);
    setPortionWarning(null);
  };

  const openPlannerModal = (recipeId: string, recipeName: string) => {
    setPlannerModal({
      isOpen: true,
      recipeId,
      recipeName,
    });
    const defaultDate = formatDateInput(new Date());
    setSelectedDate(defaultDate);
    setSelectedMeal(getFirstAvailableMeal(defaultDate));
  };

  const handleAddToMealPlan = async () => {
    if (isPastMealDate(selectedDate)) {
      toast.error('Không thể thêm món vào ngày đã qua.');
      return;
    }

    if (isPastMealSlot(selectedDate, selectedMeal)) {
      toast.error('Bữa này đã qua, không thể thêm món.');
      return;
    }

    const targetDate = parseDateInput(selectedDate);
    const weekStart = getMonday(targetDate);
    const dayOfWeek = getMealPlanDay(targetDate);
    const servings = getUserServings();

    if (!servings) {
      toast.error('Vui lòng nhập số người ăn trong hồ sơ cá nhân trước khi thêm món vào thực đơn.');
      return;
    }

    setSubmittingMealPlan(true);
    try {
      const currentPlanRes = await mealPlanAPI.get(weekStart);
      const dayItems = currentPlanRes.data?.items?.filter(
        (item: any) => item.mealDate === selectedDate && item.recipe,
      ) || [];
      const validation = validateAddRecipeToMealPlan({
        dateString: selectedDate,
        mealType: selectedMeal,
        recipeId: plannerModal.recipeId,
        dayItems,
        servings,
      });

      if (!validation.ok) {
        toast.error(validation.message);
        return;
      }

      if (validation.duplicateInDay) {
        const confirmed = confirm('Món này đã có trong ngày hôm nay. Bạn có muốn thêm lại không?');
        if (!confirmed) return;
      }

      if (validation.warning) {
        const currentMealItemsCount = dayItems.filter(
          (item: any) => item.mealType === selectedMeal && item.recipe,
        ).length;
        const mealSlotLimit = getMealSlotLimit(servings, selectedMeal);
        const isMealSlotLimitWarning = currentMealItemsCount + 1 > mealSlotLimit;

        setPortionWarning({
          servings,
          currentDayItemsCount: isMealSlotLimitWarning ? currentMealItemsCount : dayItems.length,
          maxRecommendedItems: isMealSlotLimitWarning
            ? mealSlotLimit
            : getMaxRecommendedDishes(servings),
          recipeName: plannerModal.recipeName,
          weekStart,
          dayOfWeek,
        });
        return;
      }

      await addFavoriteRecipeToMealPlan(weekStart, dayOfWeek);
    } catch (err: unknown) {
      const error = err as ApiError;
      toast.error(error.response?.data?.message || 'Không thể thêm vào thực đơn');
    } finally {
      setSubmittingMealPlan(false);
    }
  };

  const getUserServings = () => {
    const servings = Number((user as any)?.preferences?.servings);
    return Number.isInteger(servings) && servings >= 1 && servings <= 20 ? servings : null;
  };

  const addFavoriteRecipeToMealPlan = async (weekStart: string, dayOfWeek: number) => {
    await mealPlanAPI.setMealSlot({
      weekStart,
      dayOfWeek,
      mealDate: selectedDate,
      mealType: selectedMeal,
      recipeId: plannerModal.recipeId,
    });
    toast.success('Đã thêm món vào thực đơn.');
    closePlannerModal();
  };

  const confirmPortionWarning = async () => {
    if (!portionWarning) return;
    setSubmittingMealPlan(true);
    try {
      await addFavoriteRecipeToMealPlan(portionWarning.weekStart, portionWarning.dayOfWeek);
    } catch (err: unknown) {
      const error = err as ApiError;
      toast.error(error.response?.data?.message || 'Không thể thêm vào thực đơn');
    } finally {
      setSubmittingMealPlan(false);
      setPortionWarning(null);
    }
  };

  const todayValue = getTodayInputValue();

  const setQuickDate = (offset: number) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    setSelectedDate(formatDateInput(date));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Món ăn yêu thích ❤️</h1>
          <p className="mt-1 text-gray-500">Lưu trữ các món ăn yêu thích và lên kế hoạch đi chợ nấu nướng</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="space-y-4 lg:col-span-1">
          <div className="space-y-4 rounded-2xl border border-gray-250 bg-white p-4 shadow-sm">
            <h3 className="flex items-center gap-2 font-semibold text-gray-900">
              <HiFilter className="text-gray-400" /> Phân loại ẩm thực
            </h3>

            <div className="space-y-1">
              <button
                onClick={() => handleCategorySelect('')}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                  !selectedCategory ? 'bg-emerald-50 font-semibold text-emerald-700' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span>Tất cả</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{totalCount}</span>
              </button>

              {Object.entries(categoryStats).map(([cat, count]) => (
                <button
                  key={cat}
                  onClick={() => handleCategorySelect(cat)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                    selectedCategory === cat
                      ? 'bg-emerald-50 font-semibold text-emerald-700'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="truncate">{cat}</span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6 lg:col-span-3">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <HiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lg text-gray-400" />
              <input
                type="text"
                placeholder="Tìm món ăn yêu thích..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <button
              type="submit"
              className="shrink-0 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700"
            >
              Tìm kiếm
            </button>
          </form>

          {loading ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex h-72 flex-col justify-between rounded-2xl border border-gray-200 bg-white p-4 shadow-sm animate-pulse"
                />
              ))}
            </div>
          ) : favorites.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 py-16 text-center">
              <p className="mb-4 text-5xl">❤️</p>
              <h3 className="mb-1 text-lg font-bold text-gray-900">Chưa có món ăn yêu thích</h3>
              <p className="mx-auto mb-6 max-w-sm text-sm text-gray-500">
                Hãy khám phá hàng trăm công thức món ăn hấp dẫn của MealAI và nhấn nút yêu thích để lưu trữ tại đây.
              </p>
              <Link
                href="/recipes"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700"
              >
                Khám phá món ăn
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {favorites.map((fav) => (
                  <div
                    key={fav.id}
                    className="flex flex-col justify-between overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md"
                  >
                    <div className="relative h-36 shrink-0 bg-gray-100 sm:h-40">
                      <RecipeImage
                        src={fav.imageUrl}
                        alt={fav.name}
                        className="h-full w-full object-cover"
                        fallbackClassName="flex h-full w-full items-center justify-center bg-emerald-50 text-emerald-600"
                        iconClassName="text-4xl"
                      />

                      <button
                        onClick={() => handleUnfavorite(fav.id)}
                        className="absolute right-3 top-3 rounded-full bg-white/95 p-2 text-rose-500 shadow-md transition hover:scale-105 hover:text-rose-600 active:scale-95"
                        title="Bỏ yêu thích"
                      >
                        <HiHeart className="text-xl" />
                      </button>
                    </div>

                    <div className="flex flex-1 flex-col justify-between p-3 sm:p-4">
                      <div className="space-y-1">
                        <span className="inline-block rounded bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-600 sm:text-[10px]">
                          {fav.cuisineRegion || 'Ẩm thực'}
                        </span>
                        <h3 className="line-clamp-1 text-sm font-bold text-gray-955 hover:text-emerald-700 sm:text-base">
                          <Link href={`/recipes/${fav.id}`}>{fav.name}</Link>
                        </h3>
                        <div className="mt-2 flex gap-3 text-[10px] text-gray-500 sm:text-xs">
                          <span>🔥 {fav.calories} kcal</span>
                          <span>⏱️ {fav.cookingTime} phút</span>
                        </div>
                        <p className="mt-1 text-[9px] text-gray-400 sm:text-[10px]">
                          Đã yêu thích: {new Date(fav.favoritedAt).toLocaleDateString('vi-VN')}
                        </p>
                      </div>

                      <div className="mt-4 grid shrink-0 grid-cols-3 gap-1.5 border-t border-gray-100 pt-3">
                        <Link
                          href={`/recipes/${fav.id}`}
                          className="flex items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-gray-200 bg-gray-50 py-2 text-[10px] font-semibold text-gray-700 transition hover:bg-gray-100 sm:text-xs"
                        >
                          <HiEye /> Chi tiết
                        </Link>
                        <button
                          onClick={() => openPlannerModal(fav.id, fav.name)}
                          className="flex items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-emerald-200 bg-emerald-50 py-2 text-[10px] font-semibold text-emerald-700 transition hover:bg-emerald-100/70 sm:text-xs"
                        >
                          <HiCalendar /> Thực đơn
                        </button>
                        <button
                          onClick={() => handleAddToShoppingList(fav.id)}
                          className="flex items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-blue-200 bg-blue-50 py-2 text-[10px] font-semibold text-blue-700 transition hover:bg-blue-100/70 sm:text-xs"
                        >
                          <HiShoppingBag /> Đi chợ
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded-xl border border-gray-300 p-2 transition hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <HiChevronLeft className="text-lg" />
                  </button>
                  <span className="text-sm font-medium text-gray-600">
                    Trang {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="rounded-xl border border-gray-300 p-2 transition hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <HiChevronRight className="text-lg" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {plannerModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-brand-lg border border-brand-light-border bg-white shadow-brand-lg animate-scale-up">
            <div className="flex items-start justify-between gap-4 border-b border-brand-light-border px-7 py-6">
              <div>
                <h2 className="flex items-center gap-3 text-2xl font-bold text-slate-955">
                  <span className="text-brand-primary">
                    <HiCalendar />
                  </span>
                  Thêm Vào Thực Đơn
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  Chọn ngày và bữa ăn để thêm món <span className="font-bold text-slate-900">{plannerModal.recipeName}</span>
                </p>
              </div>
              <button
                onClick={closePlannerModal}
                className="btn-ghost-sm flex h-8 w-8 items-center justify-center !p-0"
                aria-label="Đóng"
              >
                <HiX className="text-xl" />
              </button>
            </div>

            <div className="flex-1 space-y-7 overflow-y-auto bg-slate-50/20 px-7 py-6">
              <section>
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-700">Chọn ngày</h3>
                <div className="mb-4 grid grid-cols-3 gap-2.5">
                  {[
                    { label: 'Hôm nay', offset: 0 },
                    { label: 'Ngày mai', offset: 1 },
                    { label: 'Ngày kia', offset: 2 },
                  ].map((item) => {
                    const date = new Date();
                    date.setDate(date.getDate() + item.offset);
                    const value = formatDateInput(date);
                    const active = selectedDate === value;

                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => setQuickDate(item.offset)}
                        className={`h-10 cursor-pointer rounded-brand-sm border text-sm font-bold transition-all ${
                          active
                            ? 'border-brand-primary bg-brand-primary text-white shadow-brand-glow'
                            : 'border-brand-light-border bg-white text-slate-800 hover:border-brand-primary/30 hover:bg-brand-primary/5'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_112px]">
                  <div className="relative flex-1">
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="h-12 w-full rounded-brand-sm border border-brand-light-border px-4 text-slate-900 shadow-brand-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/10"
                    />
                  </div>
                  <span className="flex h-12 items-center justify-center rounded-brand-sm border border-brand-light-border bg-slate-100 px-4 text-sm font-bold text-slate-650">
                    {selectedDate === todayValue ? 'Hôm nay' : 'Đã chọn'}
                  </span>
                </div>
              </section>

              <section>
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-700">Chọn bữa ăn</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {MEAL_OPTIONS.map((meal) => {
                    const active = selectedMeal === meal.key;
                    const isDisabled = isPastMealSlot(selectedDate, meal.key);

                    return (
                      <button
                        key={meal.key}
                        type="button"
                        onClick={() => !isDisabled && setSelectedMeal(meal.key)}
                        disabled={isDisabled}
                        className={`min-h-[132px] cursor-pointer rounded-brand-md border p-5 text-left shadow-brand-sm transition-all ${
                          isDisabled
                            ? 'bg-slate-100 border-slate-200 text-slate-400 opacity-60 cursor-not-allowed'
                            : active
                            ? `${meal.selected} ring-2 ring-brand-primary`
                            : `${meal.bg} ${meal.border} hover:-translate-y-0.5 hover:shadow-brand-md`
                        }`}
                      >
                        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                          <span className={`flex h-12 w-12 items-center justify-center rounded-full bg-white text-2xl shadow-brand-sm ${isDisabled ? 'text-slate-300' : meal.text}`}>
                            {isDisabled ? '🔒' : meal.icon}
                          </span>
                          <span>
                            <span className="block text-lg font-bold text-slate-900">{meal.label}</span>
                            <span className="block text-xs font-medium text-slate-400">
                              {isDisabled ? 'Đã qua' : 'Chọn bữa này'}
                            </span>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>

            <div className="grid grid-cols-1 gap-3 border-t border-brand-light-border bg-slate-50/50 px-7 py-5 sm:grid-cols-2">
              <button type="button" onClick={closePlannerModal} className="btn-ghost">
                Hủy bỏ
              </button>
              <button type="button" onClick={handleAddToMealPlan} disabled={submittingMealPlan} className="btn-primary">
                {submittingMealPlan ? 'Đang thêm...' : 'Thêm vào thực đơn'}
              </button>
            </div>
          </div>
        </div>
      )}

      {portionWarning && (
        <MealLimitWarningModal
          servings={portionWarning.servings}
          currentDayItemsCount={portionWarning.currentDayItemsCount}
          maxRecommendedItems={portionWarning.maxRecommendedItems}
          recipeName={portionWarning.recipeName}
          onCancel={() => setPortionWarning(null)}
          onConfirm={confirmPortionWarning}
          isSubmitting={submittingMealPlan}
        />
      )}
    </div>
  );
}
