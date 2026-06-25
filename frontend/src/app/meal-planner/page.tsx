'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { HiChevronLeft, HiChevronRight, HiOutlineTrash, HiOutlineDownload, HiSparkles } from 'react-icons/hi';
import { useAuth } from '@/context/AuthContext';
import MealLimitWarningModal from '@/components/MealLimitWarningModal';
import api, { mealPlanAPI, recipesAPI, shoppingListAPI, recommendationAPI } from '@/lib/api';
import { calculateMealPortionWarning, getMaxRecommendedDishes, getMaxDishesByServings, getMealSlotLimit, MealPortionWarningResult } from '@/lib/mealPortion';

const DAYS = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
const MEALS = [
  { key: 'breakfast', label: 'Sáng' },
  { key: 'lunch',     label: 'Trưa' },
  { key: 'dinner',    label: 'Tối'  },
];

type PortionWarningState = MealPortionWarningResult & {
  dayOfWeek: number;
  mealDate: string;
  mealType?: string;
};

export default function MealPlannerPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => getInitialWeekStart());
  const [highlightedSlot, setHighlightedSlot] = useState(() => getInitialHighlightedSlot());

  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ itemId: string | null; day: number; mealType: string } | null>(null);
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchingRecipes, setSearchingRecipes] = useState(false);
  const [aiSuggestingDay, setAiSuggestingDay] = useState<number | null>(null);
  const [aiSuggestionError, setAiSuggestionError] = useState<string | null>(null);
  const [portionWarning, setPortionWarning] = useState<PortionWarningState | null>(null);
  const [optimizingPortions, setOptimizingPortions] = useState(false);
  const [aiOptions, setAiOptions] = useState({
    preferNewRecipes: false,
    avoidRepeatLast7Days: false,
  });
  const [optimizationResult, setOptimizationResult] = useState<any | null>(null);
  const [optimizationError, setOptimizationError] = useState<string | null>(null);
  const [manualAddWarningModal, setManualAddWarningModal] = useState<{
    servings: number;
    currentCount: number;
    maxCount: number;
    recipeName?: string;
    recipeId?: string;
    recipeIds?: string[];
    day: number;
    dateStr: string;
    mealType: string;
    itemId?: string | null;
  } | null>(null);

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

  const getUserServings = () => {
    const servings = Number((user as any)?.preferences?.servings);
    return Number.isInteger(servings) && servings >= 1 && servings <= 20 ? servings : 0;
  };

  const getUserDailyCalories = () => {
    const calories = Number((user as any)?.dailyCalorieTarget);
    return Number.isFinite(calories) && calories > 0 ? calories : 0;
  };

  const getEnabledAiOptionLabels = () => {
    const labels = [];
    if (aiOptions.preferNewRecipes) labels.push('Ưu tiên món mới');
    if (aiOptions.avoidRepeatLast7Days) labels.push('Không lặp món trong 7 ngày');
    return labels;
  };

  const showAiOptionsToast = () => {
    const labels = getEnabledAiOptionLabels();
    const message = labels.length > 0
      ? `Đang gợi ý với tùy chọn: ${labels.join(', ')}.`
      : 'Đang gợi ý theo scoring mặc định.';
    console.log('[MealAI][meal-planner][AI options]', aiOptions);
    toast(message, { duration: 4500 });
  };

  const getMealSlotItems = (items: any[], mealType: string) =>
    items.filter((item: any) => item.mealType === mealType && item.recipe);

  const getMealSlotCapacity = (items: any[], mealType: string) => {
    const currentCount = getMealSlotItems(items, mealType).length;
    const maxCount = getMealSlotLimit(getUserServings(), mealType);
    return {
      mealType,
      currentCount,
      maxCount,
      remainingCount: Math.max(0, maxCount - currentCount),
    };
  };

  const checkMealPortionWarning = (dayOfWeek: number, mealDate: string, items: any[]) => {
    const overloadedMeal = MEALS
      .map((meal) => getMealSlotCapacity(items, meal.key))
      .find((slot) => slot.currentCount > slot.maxCount);

    if (overloadedMeal) {
      const mealLabel = getMealLabel(overloadedMeal.mealType).toLowerCase();
      setPortionWarning({
        shouldWarn: true,
        message: `Bữa ${mealLabel} có quá nhiều món so với số người ăn. Vui lòng giảm bớt món hoặc chia sang bữa khác.`,
        servings: getUserServings(),
        totalDishes: overloadedMeal.currentCount,
        maxRecommendedDishes: overloadedMeal.maxCount,
        totalPortions: overloadedMeal.currentCount,
        totalCaloriesNeeded: getUserDailyCalories(),
        dayOfWeek,
        mealDate,
        mealType: overloadedMeal.mealType,
      });
      return;
    }

    const warning = calculateMealPortionWarning({
      servings: getUserServings(),
      totalDishes: items.length,
      dailyCalories: getUserDailyCalories(),
    }, true);

    if (warning.shouldWarn) {
      setPortionWarning({
        ...warning,
        dayOfWeek,
        mealDate,
      });
    }
  };

  const handleAISuggestButtonClick = async (dayOfWeek: number) => {
    const isToday = getSlotDateInput(weekStart, dayOfWeek - 1) === getTodayInputValue();
    const dayLabelText = isToday ? 'hôm nay' : `ngày ${DAYS[dayOfWeek - 1]}`;
    const dateStr = getSlotDateInput(weekStart, dayOfWeek - 1);
    const availableMealTypes = getAvailableMealTypesForDate(dateStr);

    if (isPastMealDate(dateStr)) {
      toast.error('Ngày này đã qua, AI chỉ hỗ trợ xem lại thực đơn.');
      return;
    }
    if (availableMealTypes.length === 0) {
      toast.error('Các bữa trong ngày này đã qua, AI không thể gợi ý thêm món.');
      return;
    }

    const dayItems = plan?.items?.filter((item: any) => item.mealDate === dateStr && item.recipe) || [];
    const slotCapacities = availableMealTypes.map((mealType) => getMealSlotCapacity(dayItems, mealType));
    const currentDishCount = slotCapacities.reduce((sum, slot) => sum + slot.currentCount, 0);
    const maxDishCount = slotCapacities.reduce((sum, slot) => sum + slot.maxCount, 0);
    const remainingSlotCount = slotCapacities.reduce((sum, slot) => sum + slot.remainingCount, 0);

    if (remainingSlotCount <= 0) {
      // Case 2: Already reached or exceeded limit, ask to overwrite
      const confirmed = confirm(
        `Thực đơn ${dayLabelText} đã đầy đủ (${currentDishCount}/${maxDishCount} món).\n\nBạn có muốn AI tạo lại toàn bộ thực đơn không?`
      );
      if (!confirmed) return;
      await handleAISuggest(dayOfWeek, true, availableMealTypes);
    } else {
      if (isToday && availableMealTypes.length === 1 && availableMealTypes[0] === 'dinner') {
        toast('AI chỉ gợi ý cho bữa tối còn lại, không bù các bữa đã qua.', { duration: 5000 });
      }
      // Case 1: Still has empty slots or missing dishes, fill them (overwrite = false)
      await handleAISuggest(dayOfWeek, false, availableMealTypes);
    }
  };

  // AI gợi ý món ăn theo hồ sơ người dùng, tự động điền các món chính/rau/canh phù hợp khẩu phần ăn
  const handleAISuggest = async (dayOfWeek: number, overwrite = false, mealTypes = getAvailableMealTypesForDate(getSlotDateInput(weekStart, dayOfWeek - 1))) => {
    const dateStr = getSlotDateInput(weekStart, dayOfWeek - 1);
    if (isPastMealDate(dateStr)) {
      toast.error('Ngày này đã qua, AI chỉ hỗ trợ xem lại thực đơn.');
      return;
    }
    if (mealTypes.length === 0) {
      toast.error('Các bữa trong ngày này đã qua, AI không thể gợi ý thêm món.');
      return;
    }

    const dayItems = plan?.items?.filter((item: any) => item.mealDate === dateStr && item.recipe) || [];
    const editableMealTypes = mealTypes.filter((mealType) =>
      overwrite || getMealSlotCapacity(dayItems, mealType).remainingCount > 0,
    );
    if (editableMealTypes.length === 0) {
      toast.error('Các bữa còn lại đã đủ món theo số người ăn, AI không thêm món nữa.');
      return;
    }

    setAiSuggestingDay(dayOfWeek);
    setAiSuggestionError(null);
    try {
      showAiOptionsToast();
      const oldDayItems = plan?.items?.filter((item: any) => item.mealDate === dateStr && item.recipe) || [];
      const beforeCount = oldDayItems.length;

      const res = await mealPlanAPI.generateForDays({
        weekStart,
        days: [dayOfWeek],
        mealDates: [dateStr],
        mealTypes: editableMealTypes,
        useAntiWaste: true,
        overwrite,
        options: aiOptions,
      });
      console.log('[MealAI][meal-planner][AI suggest] raw response:', res.data);

      if (res.data?.items) {
        applyPlanUpdateKeepingScroll(res.data);
        if (res.data.warning) {
          toast.error(res.data.warning, { duration: 6000 });
        }
        const dayItems = res.data.items.filter((item: any) => item.mealDate === dateStr && item.recipe);
        console.log('[MealAI][meal-planner][AI suggest] rendered day items:', dayItems);

        const afterCount = dayItems.length;
        const addedCount = afterCount - beforeCount;

        if (dayItems.length === 0) {
          const emptyMessage = 'Không tìm thấy món ăn phù hợp với nhu cầu hiện tại.';
          setAiSuggestionError(emptyMessage);
          toast.error(emptyMessage);
          return;
        }

        checkMealPortionWarning(dayOfWeek, dateStr, dayItems);

        if (overwrite) {
          toast.success(`AI đã tạo lại thực đơn cho ngày ${DAYS[dayOfWeek - 1]}! 🤖`);
        } else {
          if (addedCount > 0) {
            toast.success(`Đã bổ sung ${addedCount} món còn thiếu cho thực đơn.`);
          } else {
            toast.success(`Thực đơn đã được cập nhật.`);
          }
        }
      } else {
        await loadPlan();
        toast.success(`Thực đơn đã được cập nhật.`);
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'Có lỗi khi gọi AI gợi ý';
      console.error('[MealAI][meal-planner][AI suggest] error:', err);
      setAiSuggestionError(errMsg);
      toast.error(errMsg);
    } finally {
      setAiSuggestingDay(null);
    }
  };

  const handleOptimizePortions = async () => {
    if (!portionWarning) return;
    const availableMealTypes = getAvailableMealTypesForDate(portionWarning.mealDate);
    if (isPastMealDate(portionWarning.mealDate) || availableMealTypes.length === 0) {
      toast.error('Không thể tối ưu thực đơn khi có bữa trong ngày đã qua.');
      return;
    }

    setOptimizingPortions(true);
    setAiSuggestionError(null);
    setOptimizationError(null);
    try {
      const res = await mealPlanAPI.generateForDays({
        weekStart,
        days: [portionWarning.dayOfWeek],
        mealDates: [portionWarning.mealDate],
        useAntiWaste: true,
        overwrite: true,
        optimizePortions: true,
        mealTypes: availableMealTypes,
        options: aiOptions,
      });

      const details = res.data?.optimizationDetails;
      if (details) {
        if (details.optimized === true) {
          applyPlanUpdateKeepingScroll(res.data);
          setOptimizationResult({
            beforeCount: details.beforeCount,
            afterCount: details.afterCount,
            removedItems: details.removedItems,
          });
          toast.success(`Đã tối ưu thực đơn: ${details.beforeCount} món → ${details.afterCount} món`);
          setPortionWarning(null);
        } else {
          let errorMsg = 'Không thể tối ưu thực đơn lúc này.';
          if (details.errorReason?.startsWith('locked_exceeds_limit:')) {
            const parts = details.errorReason.split(':');
            const lockedCount = parts[1];
            const limitCount = parts[2];
            errorMsg = `Không thể tối ưu vì có ${lockedCount} món đã bị khóa, vượt ngưỡng ${limitCount} món.`;
          } else if (details.errorReason === 'all_locked') {
            errorMsg = 'Món đã bị khóa.';
          } else if (details.errorReason === 'nutrition_limit') {
            errorMsg = 'Loại bỏ thêm sẽ gây thiếu dinh dưỡng.';
          } else if (details.errorReason === 'not_enough_recipes') {
            errorMsg = 'Không đủ công thức thay thế.';
          }
          setOptimizationError(errorMsg);
          toast.error(errorMsg);
        }
      } else {
        if (res.data?.items) {
          applyPlanUpdateKeepingScroll(res.data);
        } else {
          await loadPlan();
        }
        toast.success('Đã tự động tối ưu thực đơn theo số người ăn.');
        setPortionWarning(null);
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'Không thể tối ưu thực đơn lúc này';
      console.error('[MealAI][meal-planner][portion optimize] error:', err);
      setOptimizationError(errMsg);
      toast.error(errMsg);
    } finally {
      setOptimizingPortions(false);
    }
  };

  const clearDayPlan = async (dayOfWeek: number) => {
    if (isDayFullyPast(weekStart, dayOfWeek - 1)) { toast.error('Ngày này đã qua hết các bữa ăn, không thể chỉnh sửa.'); return; }
    if (!plan) return;
    const dayItems = plan.items?.filter((item: any) => item.dayOfWeek === dayOfWeek);
    if (!dayItems || dayItems.length === 0) { toast.error('Ngày này chưa có món ăn nào để xóa!'); return; }

    // Only delete items in slots that are NOT in the past
    const activeItems = dayItems.filter((item: any) => !isPastMealSlot(weekStart, dayOfWeek - 1, item.mealType));
    if (activeItems.length === 0) { toast.error('Tất cả bữa ăn đã qua của ngày này đều không thể xóa!'); return; }

    if (!confirm(`Bạn có chắc muốn xóa các món ăn chưa diễn ra trong ${DAYS[dayOfWeek - 1]}?`)) return;
    try {
      for (const item of activeItems) await mealPlanAPI.removeItem(plan.id, item.id);
      toast.success(`Đã xóa các món ăn trong các bữa chưa diễn ra của ${DAYS[dayOfWeek - 1]}`);
      loadPlan();
    } catch { toast.error('Có lỗi xảy ra khi xóa'); }
  };

  const handleOpenSelector = (itemId: string | null, day: number, mealType: string) => {
    if (isPastMealSlot(weekStart, day - 1, mealType)) { toast.error('Bữa ăn này đã qua, không thể thêm hoặc đổi món nữa.'); return; }
    setSelectedSlot({ itemId, day, mealType });
    setSelectedRecipeIds([]);
    setSelectorOpen(true);
    setSearchQuery('');
    fetchInitialRecipes();
  };

  const handleCloseSelector = () => {
    setSelectorOpen(false);
    setSelectedSlot(null);
    setSelectedRecipeIds([]);
    setSearchQuery('');
  };

  const applyPlanUpdateKeepingScroll = (nextPlan: any) => {
    const scrollX = typeof window !== 'undefined' ? window.scrollX : 0;
    const scrollY = typeof window !== 'undefined' ? window.scrollY : 0;
    setPlan(nextPlan);
    requestAnimationFrame(() => window.scrollTo(scrollX, scrollY));
  };

  const toggleRecipeSelection = (recipeId: string) => {
    setSelectedRecipeIds((current) =>
      current.includes(recipeId)
        ? current.filter((id) => id !== recipeId)
        : [...current, recipeId],
    );
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

  const executeSelectRecipe = async (recipeId: string, dateStr: string, day: number, mealType: string, itemId: string | null, selectedRecipe: any) => {
    try {
      let nextPlan = null;
      if (plan && itemId) {
        const res = await mealPlanAPI.swapRecipe(plan.id, itemId, recipeId);
        const updatedPlan = {
          ...plan,
          items: plan.items.map((item: any) =>
            item.id === itemId
              ? {
                  ...item,
                  ...res.data,
                  recipe: selectedRecipe
                    ? {
                        id: selectedRecipe.id,
                        name: selectedRecipe.name,
                        imageUrl: selectedRecipe.imageUrl,
                        calories: selectedRecipe.calories,
                        cookingTime: selectedRecipe.cookingTime,
                      }
                    : res.data.recipe,
                }
              : item,
          ),
        };
        nextPlan = updatedPlan;
        applyPlanUpdateKeepingScroll(updatedPlan);
        toast.success('Đã cập nhật món ăn thành công!');
      } else {
        const res = await mealPlanAPI.setMealSlot({ weekStart, dayOfWeek: day, mealDate: dateStr, mealType: mealType, recipeId });
        nextPlan = res.data;
        applyPlanUpdateKeepingScroll(res.data);
        toast.success('Đã chọn món ăn thành công!');
      }
      setHighlightedSlot({ weekStart, day, mealType });
      handleCloseSelector();

      if (nextPlan) {
        const dayItems = nextPlan.items.filter((item: any) => item.mealDate === dateStr && item.recipe);
        const warning = calculateMealPortionWarning({
          servings: getUserServings(),
          totalDishes: dayItems.length,
          dailyCalories: getUserDailyCalories(),
        }, false);
        if (warning.shouldWarn) {
          toast.error(warning.message || 'Bạn đã vượt số lượng món khuyến nghị cho số người ăn hiện tại.', { duration: 5000 });
        }
      }
    } catch { toast.error('Không thể cập nhật món ăn'); }
  };

  const handleSelectRecipe = async (recipeId: string) => {
    if (!selectedSlot) return;
    if (isPastSlotDate(weekStart, selectedSlot.day - 1)) { toast.error('Không thể thêm hoặc đổi món cho ngày đã qua.'); return; }

    const dateStr = getSlotDateInput(weekStart, selectedSlot.day - 1);
    const selectedRecipe = searchResults.find((recipe: any) => recipe.id === recipeId);

    // If it's a swap (itemId is present), we don't increase count, so bypass warning modal
    if (selectedSlot.itemId) {
      executeSelectRecipe(recipeId, dateStr, selectedSlot.day, selectedSlot.mealType, selectedSlot.itemId, selectedRecipe);
      return;
    }

    const dayItems = plan?.items?.filter((item: any) => item.mealDate === dateStr && item.recipe) || [];
    const slotCapacity = getMealSlotCapacity(dayItems, selectedSlot.mealType);
    const currentCount = slotCapacity.currentCount;
    const maxCount = slotCapacity.maxCount;

    if (currentCount + 1 > maxCount) {
      setManualAddWarningModal({
        servings: getUserServings(),
        currentCount,
        maxCount,
        recipeName: selectedRecipe ? selectedRecipe.name : 'Món ăn',
        recipeId,
        day: selectedSlot.day,
        dateStr,
        mealType: selectedSlot.mealType,
        itemId: selectedSlot.itemId,
      });
      return;
    }

    executeSelectRecipe(recipeId, dateStr, selectedSlot.day, selectedSlot.mealType, selectedSlot.itemId, selectedRecipe);
  };

  const executeAddSelectedRecipes = async (recipeIds: string[], dateStr: string, day: number, mealType: string) => {
    try {
      const res = await mealPlanAPI.setMealSlot({
        weekStart,
        dayOfWeek: day,
        mealDate: dateStr,
        mealType: mealType,
        recipeIds: recipeIds,
      });

      applyPlanUpdateKeepingScroll(res.data);
      setHighlightedSlot({ weekStart, day, mealType });
      toast.success(`Đã thêm ${recipeIds.length} món vào ${getMealLabel(mealType)}!`);
      handleCloseSelector();

      const dayItems = res.data.items.filter((item: any) => item.mealDate === dateStr && item.recipe);
      const warning = calculateMealPortionWarning({
        servings: getUserServings(),
        totalDishes: dayItems.length,
        dailyCalories: getUserDailyCalories(),
      }, false);
      if (warning.shouldWarn) {
        toast.error(warning.message || 'Bạn đã vượt số lượng món khuyến nghị cho số người ăn hiện tại.', { duration: 5000 });
      }
    } catch { toast.error('Không thể cập nhật món ăn'); }
  };

  const handleAddSelectedRecipes = async () => {
    if (!selectedSlot || selectedSlot.itemId || selectedRecipeIds.length === 0) return;
    if (isPastMealSlot(weekStart, selectedSlot.day - 1, selectedSlot.mealType)) { toast.error('Bữa ăn này đã qua, không thể thêm món nữa.'); return; }

    const dateStr = getSlotDateInput(weekStart, selectedSlot.day - 1);
    const dayItems = plan?.items?.filter((item: any) => item.mealDate === dateStr && item.recipe) || [];
    const slotCapacity = getMealSlotCapacity(dayItems, selectedSlot.mealType);
    const currentCount = slotCapacity.currentCount;
    const maxCount = slotCapacity.maxCount;

    if (currentCount + selectedRecipeIds.length > maxCount) {
      const selectedNames = selectedRecipeIds.map(id => {
        const r = searchResults.find((x: any) => x.id === id);
        return r ? r.name : 'Món ăn';
      });
      setManualAddWarningModal({
        servings: getUserServings(),
        currentCount,
        maxCount,
        recipeIds: [...selectedRecipeIds],
        recipeName: selectedNames.join(', '),
        day: selectedSlot.day,
        dateStr,
        mealType: selectedSlot.mealType,
      });
      return;
    }

    executeAddSelectedRecipes(selectedRecipeIds, dateStr, selectedSlot.day, selectedSlot.mealType);
  };

  const handleDeleteItem = async (item: any) => {
    if (!plan) return;
    if (isPastMealSlot(weekStart, item.dayOfWeek - 1, item.mealType)) { toast.error('Bữa ăn này đã qua, không thể xóa món nữa.'); return; }
    try {
      await mealPlanAPI.removeItem(plan.id, item.id);
      toast.success('Đã xóa món ăn thành công!');
      loadPlan();
    } catch { toast.error('Không thể xóa món ăn'); }
  };

  const handleMealItemClick = (item: any) => {
    if (!item?.recipe?.id) return;
    router.push(`/recipes/${item.recipe.id}`);
  };

  const handleToggleMealItem = async (item: any, mealDate: string, mealType: string, isConsumed: boolean) => {
    if (!plan) return;
    if (isPastMealDate(mealDate) || isPastMealSlot(weekStart, item.dayOfWeek - 1, mealType)) {
      toast.error('Không thể thay đổi món ăn của ngày hoặc bữa đã qua. Bạn chỉ có thể xem chi tiết món.');
      return;
    }

    try {
      await mealPlanAPI.toggleConsume(plan.id, item.id, isConsumed);
      if (isConsumed) {
        toast.success(`Đã hoàn thành ${item.recipe?.name || 'bữa ăn'} & tự động trừ nguyên liệu tủ lạnh!`);
      } else {
        toast.success(`Đã hoàn tác hoàn thành ${item.recipe?.name || 'bữa ăn'} & hoàn lại nguyên liệu!`);
      }
      window.dispatchEvent(new CustomEvent('inventory-updated'));
      loadPlan();
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Có lỗi xảy ra khi cập nhật trạng thái bữa ăn');
    }
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

        {aiSuggestionError && (
          <div className="mb-4 rounded-brand-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
            {aiSuggestionError}
          </div>
        )}

        {/* AI Suggestion Settings */}
        <div className="card-dashboard mb-6 p-4 flex flex-col gap-4 bg-emerald-50/5 border-brand-primary/20">
          <div className="text-sm font-bold text-slate-700 flex items-center gap-1.5 shrink-0">
            ⚙️ Tùy chọn gợi ý AI:
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-start gap-2 text-sm text-slate-600 font-semibold cursor-pointer select-none">
              <input
                type="checkbox"
                checked={aiOptions.preferNewRecipes}
                onChange={(e) =>
                  setAiOptions((current) => ({
                    ...current,
                    preferNewRecipes: e.target.checked,
                  }))
                }
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-primary focus:ring-brand-primary cursor-pointer"
              />
              <span>
                <span className="block">Ưu tiên món mới</span>
                {aiOptions.preferNewRecipes && (
                  <span className="mt-1 block text-xs font-medium text-slate-500">
                    Hệ thống sẽ cộng điểm cho món ít xuất hiện trong thực đơn của bạn.
                  </span>
                )}
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-600 font-semibold cursor-pointer select-none">
              <input
                type="checkbox"
                checked={aiOptions.avoidRepeatLast7Days}
                onChange={(e) =>
                  setAiOptions((current) => ({
                    ...current,
                    avoidRepeatLast7Days: e.target.checked,
                  }))
                }
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-primary focus:ring-brand-primary cursor-pointer"
              />
              <span>
                <span className="block">Không lặp món trong 7 ngày</span>
                {aiOptions.avoidRepeatLast7Days && (
                  <span className="mt-1 block text-xs font-medium text-slate-500">
                    Hệ thống sẽ tránh chọn lại các món đã xuất hiện trong 7 ngày gần nhất.
                  </span>
                )}
              </span>
            </label>
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
              const isPastMealPlanDate = isPastMealDate(slotDate);
              const isToday = slotDate === todayInput;

              const dayItemsForDay = plan?.items?.filter((item: any) => item.dayOfWeek === dayOfWeekNumber && item.recipe !== null) || [];
              const usedDishesCount = dayItemsForDay.length;
              const maxDishesCount = getMaxRecommendedDishes(getUserServings());

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
                      <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 flex-wrap">
                        {dayLabel}{' '}
                        <span className="font-normal text-slate-400 text-sm">{dateStr}</span>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                          Đã sử dụng: {usedDishesCount}/{maxDishesCount} món
                        </span>
                      </h2>
                      {isToday && (
                        <span className="rounded-brand-sm bg-brand-primary px-2 py-0.5 text-xs font-semibold text-white">
                          Hôm nay
                        </span>
                      )}
                      {isPastMealPlanDate && (
                        <span className="rounded-brand-sm border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                          Đã qua
                        </span>
                      )}
                    </div>

                    {/* Actions — only show for non-past days */}
                    {!isPastDay && (
                      <div className="flex flex-wrap items-center gap-2">
                        {!isDayFullyPast(weekStart, dayIdx) && (
                          <button
                            onClick={() => handleAISuggestButtonClick(dayOfWeekNumber)}
                            disabled={aiSuggestingDay === dayOfWeekNumber}
                            className="bg-gradient-to-r from-brand-primary to-brand-secondary text-white font-bold rounded-brand-sm shadow-brand-sm hover:shadow-brand-glow hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs border-none outline-none"
                          >
                            <HiSparkles className={`h-3.5 w-3.5 ${aiSuggestingDay === dayOfWeekNumber ? 'animate-spin' : ''}`} />
                            {aiSuggestingDay === dayOfWeekNumber ? 'Đang gợi ý...' : '✨ AI Gợi Ý'}
                          </button>
                        )}
                        {plan && (
                          <button
                            onClick={() => exportDayToShoppingList(dayOfWeekNumber)}
                            className="btn-outline-sm"
                          >
                            <HiOutlineDownload className="h-3.5 w-3.5" />
                            Tạo Danh Sách Mua Sắm
                          </button>
                        )}
                        {plan && !isDayFullyPast(weekStart, dayIdx) && (
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
                      const isPastMealItemSlot = isPastMealPlanDate || isPastMealSlot(weekStart, dayIdx, meal.key);
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
                            <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
                              {meal.label}
                              {isPastMealItemSlot && (
                                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold normal-case tracking-normal text-slate-400">
                                  Đã qua
                                </span>
                              )}
                            </span>
                            {!isPastMealSlot(weekStart, dayIdx, meal.key) && (
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
                                  onClick={() => handleMealItemClick(item)}
                                  className="group relative cursor-pointer rounded-brand-sm border border-brand-primary/20 bg-emerald-50/5 p-2 hover:bg-emerald-50/15 hover:border-brand-primary/45 transition-all shadow-brand-sm"
                                >
                                  {!isPastMealItemSlot && (
                                    <div className="absolute top-2 right-2 z-10" onClick={(e) => e.stopPropagation()}>
                                      <input
                                        type="checkbox"
                                        checked={!!item.isConsumed}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => handleToggleMealItem(item, slotDate, meal.key, e.target.checked)}
                                        className="w-3.5 h-3.5 rounded-full text-emerald-600 border-gray-300 focus:ring-emerald-500 cursor-pointer"
                                        title="Đánh dấu hoàn thành bữa ăn"
                                      />
                                    </div>
                                  )}

                                  <div className="flex items-center gap-2">
                                    {/* Recipe Image */}
                                    <Link href={`/recipes/${item.recipe?.id}`} className="shrink-0" onClick={(e) => e.stopPropagation()}>
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
                                      <Link href={`/recipes/${item.recipe?.id}`} onClick={(e) => e.stopPropagation()}>
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
                                  {!isPastMealSlot(weekStart, dayIdx, meal.key) && (
                                    <div className="mt-1.5 flex gap-1">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenSelector(item.id, dayOfWeekNumber, meal.key);
                                        }}
                                        className="flex-1 rounded-brand-sm border border-brand-primary/30 py-1 text-[10px] font-bold text-brand-primary hover:bg-brand-primary/10 transition-all cursor-pointer"
                                      >
                                        Đổi
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteItem(item);
                                        }}
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

        {/* Meal Portion Warning Modal */}
        {portionWarning && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg overflow-hidden rounded-brand-lg border border-amber-200 bg-white shadow-brand-lg max-h-[90vh] flex flex-col animate-scale-up">
              <div className="border-b border-amber-100 bg-amber-50 px-5 py-4 flex-shrink-0">
                <h3 className="text-base font-extrabold text-amber-800">
                  Cảnh báo khẩu phần thực đơn
                </h3>
                <p className="mt-1 text-sm font-medium leading-relaxed text-amber-700">
                  {portionWarning.message}
                </p>
              </div>

              <div className="space-y-4 px-5 py-4 overflow-y-auto flex-1 bg-white">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-brand-sm border border-brand-light-border bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Số người</p>
                    <p className="mt-1 text-lg font-black text-slate-900">{portionWarning.servings}</p>
                  </div>
                  <div className="rounded-brand-sm border border-brand-light-border bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Số món</p>
                    <p className="mt-1 text-lg font-black text-slate-900">{portionWarning.totalDishes}</p>
                  </div>
                  <div className="rounded-brand-sm border border-brand-light-border bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Ngưỡng</p>
                    <p className="mt-1 text-lg font-black text-slate-900">{portionWarning.maxRecommendedDishes}</p>
                  </div>
                  <div className="rounded-brand-sm border border-brand-light-border bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Khẩu phần</p>
                    <p className="mt-1 text-lg font-black text-slate-900">{portionWarning.totalPortions}</p>
                  </div>
                </div>

                <div className="rounded-brand-md border border-brand-primary/15 bg-brand-primary/5 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-brand-primary">Tổng calories cần thiết</p>
                  <p className="mt-1 text-2xl font-black text-slate-900">
                    {portionWarning.totalCaloriesNeeded > 0
                      ? `${portionWarning.totalCaloriesNeeded.toLocaleString('vi-VN')} kcal/ngày`
                      : 'Chưa đủ dữ liệu calories'}
                  </p>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    Hệ thống sẽ ưu tiên giữ món chính theo từng bữa, món đã khóa và món có giá trị dinh dưỡng tốt hơn khi tối ưu.
                  </p>
                </div>

                {optimizationError && (
                  <div className="rounded-brand-md border border-red-200 bg-red-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-red-700">Lỗi tối ưu thực đơn</p>
                    <p className="mt-1 text-sm font-semibold text-red-800">{optimizationError}</p>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 border-t border-brand-light-border bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end flex-shrink-0">
                <button
                  onClick={() => { setPortionWarning(null); setOptimizationError(null); }}
                  disabled={optimizingPortions}
                  className="btn-ghost-sm justify-center"
                >
                  Giữ nguyên
                </button>
                <button
                  onClick={handleOptimizePortions}
                  disabled={optimizingPortions}
                  className="btn-primary-sm justify-center"
                >
                  {optimizingPortions ? 'Đang tối ưu...' : 'Tự động tối ưu thực đơn'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Optimization Success Modal */}
        {optimizationResult && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg overflow-hidden rounded-brand-lg border border-emerald-200 bg-white shadow-brand-lg max-h-[90vh] flex flex-col animate-scale-up">
              <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-4 flex-shrink-0">
                <h3 className="text-base font-extrabold text-emerald-800 flex items-center gap-1.5">
                  Tối ưu thực đơn thành công! 🎉
                </h3>
              </div>

              <div className="space-y-4 px-5 py-4 overflow-y-auto flex-1 bg-white">
                <div className="flex justify-between items-center bg-slate-50 p-4 rounded-brand-md border border-brand-light-border">
                  <div className="text-center flex-1">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Trước tối ưu</p>
                    <p className="mt-1 text-lg font-black text-slate-700">{optimizationResult.beforeCount} món</p>
                  </div>
                  <div className="text-slate-400 font-bold px-2">→</div>
                  <div className="text-center flex-1">
                    <p className="text-[10px] font-bold uppercase text-emerald-500">Sau tối ưu</p>
                    <p className="mt-1 text-lg font-black text-emerald-600">{optimizationResult.afterCount} món</p>
                  </div>
                </div>

                {optimizationResult.removedItems && optimizationResult.removedItems.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Món đã loại bỏ:</h4>
                    <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {optimizationResult.removedItems.map((item: any, idx: number) => (
                        <li key={idx} className="text-xs bg-red-50 text-red-700 border border-red-100 px-3 py-2.5 rounded-brand-sm flex justify-between items-center">
                          <span className="font-semibold">{item.recipeName}</span>
                          <span className="text-[9px] bg-red-100 px-2 py-0.5 rounded-full font-bold uppercase">
                            {item.mealType === 'breakfast' ? 'Sáng' : item.mealType === 'lunch' ? 'Trưa' : 'Tối'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="border-t border-brand-light-border bg-slate-50 px-5 py-4 flex justify-end">
                <button
                  onClick={() => setOptimizationResult(null)}
                  className="btn-primary-sm justify-center w-full sm:w-auto"
                >
                  Đồng ý
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Manual Add Limit Warning Modal */}
        {manualAddWarningModal && (
          <MealLimitWarningModal
            servings={manualAddWarningModal.servings}
            currentDayItemsCount={manualAddWarningModal.currentCount}
            maxRecommendedItems={manualAddWarningModal.maxCount}
            recipeName={manualAddWarningModal.recipeName || 'Món ăn'}
            onCancel={() => setManualAddWarningModal(null)}
            onConfirm={async () => {
              const info = manualAddWarningModal;
              setManualAddWarningModal(null);
              if (info.recipeIds) {
                await executeAddSelectedRecipes(info.recipeIds, info.dateStr, info.day, info.mealType);
              } else if (info.recipeId) {
                const selectedRecipe = searchResults.find((recipe: any) => recipe.id === info.recipeId);
                await executeSelectRecipe(info.recipeId, info.dateStr, info.day, info.mealType, info.itemId || null, selectedRecipe);
              }
            }}
          />
        )}

        {/* Recipe Selector Modal */}
        {selectorOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="flex max-h-[90vh] sm:max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-brand-lg bg-white shadow-brand-lg border border-brand-light-border animate-scale-up">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-brand-light-border px-5 py-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Chọn món — {selectedSlot ? `${getMealLabel(selectedSlot.mealType)}, ${DAYS[selectedSlot.day - 1]}` : ''}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">Tìm và chọn công thức muốn thêm vào thực đơn.</p>
                </div>
                <button
                  onClick={handleCloseSelector}
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
                    {(() => {
                      const dayRecipes = selectedSlot
                        ? plan?.items?.filter((item: any) => item.dayOfWeek === selectedSlot.day && item.recipeId !== null)
                        : [];
                      const dayRecipeIds = dayRecipes?.map((item: any) => item.recipeId) || [];
                      const filteredResults = searchResults.filter((recipe: any) => !dayRecipeIds.includes(recipe.id));

                      if (filteredResults.length === 0) {
                        return (
                          <div className="col-span-2 py-6 text-center text-slate-400">
                            <p className="text-sm font-medium">Không có món ăn phù hợp (các món khác đã có trong thực đơn ngày hôm nay)</p>
                          </div>
                        );
                      }

                      return filteredResults.map((recipe: any) => {
                        const isAddMode = !selectedSlot?.itemId;
                        const isSelected = selectedRecipeIds.includes(recipe.id);

                        return (
                          <div
                            key={recipe.id}
                            onClick={isAddMode ? () => toggleRecipeSelection(recipe.id) : undefined}
                            className={`flex items-center justify-between gap-3 rounded-brand-md border bg-white p-3 shadow-brand-sm transition hover:border-brand-primary/30 hover:shadow-brand-md ${
                              isSelected ? 'border-brand-primary bg-brand-primary/5 ring-1 ring-brand-primary/25' : 'border-brand-light-border'
                            } ${isAddMode ? 'cursor-pointer' : ''}`}
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
                          {isAddMode ? (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleRecipeSelection(recipe.id)}
                              onClick={(event) => event.stopPropagation()}
                              className="h-5 w-5 shrink-0 rounded border-brand-light-border text-brand-primary focus:ring-brand-primary cursor-pointer"
                              aria-label={`Chọn ${recipe.name}`}
                            />
                          ) : (
                            <button
                              onClick={() => handleSelectRecipe(recipe.id)}
                              className="btn-primary-sm shrink-0"
                            >
                              Chọn
                            </button>
                          )}
                        </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex flex-col gap-3 border-t border-brand-light-border px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-semibold text-slate-500">
                  {!selectedSlot?.itemId && selectedRecipeIds.length > 0
                    ? `Đã chọn ${selectedRecipeIds.length} món`
                    : 'Có thể chọn nhiều món cùng lúc'}
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={handleCloseSelector}
                    className="btn-ghost-sm inline-flex"
                  >
                    Hủy bỏ
                  </button>
                  {!selectedSlot?.itemId && (
                    <button
                      onClick={handleAddSelectedRecipes}
                      disabled={selectedRecipeIds.length === 0}
                      className={`btn-primary-sm inline-flex ${
                        selectedRecipeIds.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      Thêm {selectedRecipeIds.length} món đã chọn
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* â”€â”€â”€ Helpers â”€â”€â”€ */
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
  if (weekStart < getCurrentWeekStart() || isPastMealSlot(weekStart, day - 1, mealType)) return null;
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
function isPastMealDate(dateString: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const mealDate = parseDateInput(dateString);
  mealDate.setHours(0, 0, 0, 0);

  return mealDate < today;
}
function getAvailableMealTypesForDate(dateString: string): string[] {
  return MEALS
    .map((meal) => meal.key)
    .filter((mealType) => !isPastMealSlotByDate(dateString, mealType));
}
function isPastMealSlotByDate(dateString: string, mealType: string): boolean {
  if (isPastMealDate(dateString)) return true;
  if (dateString !== getTodayInputValue()) return false;

  const currentHour = new Date().getHours();
  if (mealType === 'breakfast') return currentHour >= 10;
  if (mealType === 'lunch') return currentHour >= 14;
  if (mealType === 'dinner') return currentHour >= 21;
  return false;
}
function isPastSlotDate(startStr: string, dayOffset: number): boolean {
  return getSlotDateInput(startStr, dayOffset) < getTodayInputValue();
}
function isPastMealSlot(startStr: string, dayOffset: number, mealType: string): boolean {
  const slotDate = getSlotDateInput(startStr, dayOffset);
  const todayDate = getTodayInputValue();
  if (slotDate < todayDate) return true;
  if (slotDate > todayDate) return false;

  const currentHour = new Date().getHours();
  if (mealType === 'breakfast') return currentHour >= 10;
  if (mealType === 'lunch') return currentHour >= 14;
  if (mealType === 'dinner') return currentHour >= 21;
  return false;
}
function isDayFullyPast(startStr: string, dayOffset: number): boolean {
  const slotDate = getSlotDateInput(startStr, dayOffset);
  const todayDate = getTodayInputValue();
  if (slotDate < todayDate) return true;
  if (slotDate > todayDate) return false;

  const currentHour = new Date().getHours();
  return currentHour >= 21;
}
function getMonday(d: Date): string {
  const target = new Date(d);
  const day = target.getDay();
  const diff = target.getDate() - day + (day === 0 ? -6 : 1);
  target.setDate(diff);
  return formatDateInput(target);
}
