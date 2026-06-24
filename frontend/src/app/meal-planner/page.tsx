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

const DAYS = ['Thá»© Hai', 'Thá»© Ba', 'Thá»© TÆ°', 'Thá»© NÄƒm', 'Thá»© SÃ¡u', 'Thá»© Báº£y', 'Chá»§ Nháº­t'];
const MEALS = [
  { key: 'breakfast', label: 'SÃ¡ng' },
  { key: 'lunch',     label: 'TrÆ°a' },
  { key: 'dinner',    label: 'Tá»‘i'  },
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
  const [prioritizeNew, setPrioritizeNew] = useState(true);
  const [noRepeatIn7Days, setNoRepeatIn7Days] = useState(false);
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
      toast.error('NgÃ y nÃ y Ä‘Ã£ qua, chá»‰ cÃ³ thá»ƒ táº¡o danh sÃ¡ch cho hÃ´m nay hoáº·c tÆ°Æ¡ng lai.');
      return;
    }
    if (!plan) { toast.error('Vui lÃ²ng chá»n mÃ³n Äƒn trÆ°á»›c khi táº¡o danh sÃ¡ch mua sáº¯m!'); return; }
    try {
      await shoppingListAPI.generate(plan.id, [dayOfWeek]);
      toast.success(`ÄÃ£ xuáº¥t nguyÃªn liá»‡u ${DAYS[dayOfWeek - 1]} sang danh sÃ¡ch Ä‘i chá»£!`, { duration: 4000 });
      setTimeout(() => { window.location.href = '/shopping-list'; }, 1200);
    } catch { toast.error('CÃ³ lá»—i xáº£y ra khi táº¡o danh sÃ¡ch Ä‘i chá»£'); }
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
        message: `Bá»¯a ${mealLabel} cÃ³ quÃ¡ nhiá»u mÃ³n so vá»›i sá»‘ ngÆ°á»i Äƒn. Vui lÃ²ng giáº£m bá»›t mÃ³n hoáº·c chia sang bá»¯a khÃ¡c.`,
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
    const dayLabelText = isToday ? 'hÃ´m nay' : `ngÃ y ${DAYS[dayOfWeek - 1]}`;
    const dateStr = getSlotDateInput(weekStart, dayOfWeek - 1);
    const availableMealTypes = getAvailableMealTypesForDate(dateStr);

    if (isPastMealDate(dateStr)) {
      toast.error('NgÃ y nÃ y Ä‘Ã£ qua, AI chá»‰ há»— trá»£ xem láº¡i thá»±c Ä‘Æ¡n.');
      return;
    }
    if (availableMealTypes.length === 0) {
      toast.error('CÃ¡c bá»¯a trong ngÃ y nÃ y Ä‘Ã£ qua, AI khÃ´ng thá»ƒ gá»£i Ã½ thÃªm mÃ³n.');
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
        `Thá»±c Ä‘Æ¡n ${dayLabelText} Ä‘Ã£ Ä‘áº§y Ä‘á»§ (${currentDishCount}/${maxDishCount} mÃ³n).\n\nBáº¡n cÃ³ muá»‘n AI táº¡o láº¡i toÃ n bá»™ thá»±c Ä‘Æ¡n khÃ´ng?`
      );
      if (!confirmed) return;
      await handleAISuggest(dayOfWeek, true, availableMealTypes);
    } else {
      if (isToday && availableMealTypes.length === 1 && availableMealTypes[0] === 'dinner') {
        toast('AI chá»‰ gá»£i Ã½ cho bá»¯a tá»‘i cÃ²n láº¡i, khÃ´ng bÃ¹ cÃ¡c bá»¯a Ä‘Ã£ qua.', { duration: 5000 });
      }
      // Case 1: Still has empty slots or missing dishes, fill them (overwrite = false)
      await handleAISuggest(dayOfWeek, false, availableMealTypes);
    }
  };

  // AI gá»£i Ã½ mÃ³n Äƒn theo há»“ sÆ¡ ngÆ°á»i dÃ¹ng, tá»± Ä‘á»™ng Ä‘iá»n cÃ¡c mÃ³n chÃ­nh/rau/canh phÃ¹ há»£p kháº©u pháº§n Äƒn
  const handleAISuggest = async (dayOfWeek: number, overwrite = false, mealTypes = getAvailableMealTypesForDate(getSlotDateInput(weekStart, dayOfWeek - 1))) => {
    const dateStr = getSlotDateInput(weekStart, dayOfWeek - 1);
    if (isPastMealDate(dateStr)) {
      toast.error('NgÃ y nÃ y Ä‘Ã£ qua, AI chá»‰ há»— trá»£ xem láº¡i thá»±c Ä‘Æ¡n.');
      return;
    }
    if (mealTypes.length === 0) {
      toast.error('CÃ¡c bá»¯a trong ngÃ y nÃ y Ä‘Ã£ qua, AI khÃ´ng thá»ƒ gá»£i Ã½ thÃªm mÃ³n.');
      return;
    }

    const dayItems = plan?.items?.filter((item: any) => item.mealDate === dateStr && item.recipe) || [];
    const editableMealTypes = mealTypes.filter((mealType) =>
      overwrite || getMealSlotCapacity(dayItems, mealType).remainingCount > 0,
    );
    if (editableMealTypes.length === 0) {
      toast.error('CÃ¡c bá»¯a cÃ²n láº¡i Ä‘Ã£ Ä‘á»§ mÃ³n theo sá»‘ ngÆ°á»i Äƒn, AI khÃ´ng thÃªm mÃ³n ná»¯a.');
      return;
    }

    setAiSuggestingDay(dayOfWeek);
    setAiSuggestionError(null);
    try {
      const oldDayItems = plan?.items?.filter((item: any) => item.mealDate === dateStr && item.recipe) || [];
      const beforeCount = oldDayItems.length;

      const res = await mealPlanAPI.generateForDays({
        weekStart,
        days: [dayOfWeek],
        mealDates: [dateStr],
        mealTypes: editableMealTypes,
        useAntiWaste: true,
        overwrite,
        prioritizeNew,
        noRepeatIn7Days,
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
          const emptyMessage = 'KhÃ´ng tÃ¬m tháº¥y mÃ³n Äƒn phÃ¹ há»£p vá»›i nhu cáº§u hiá»‡n táº¡i.';
          setAiSuggestionError(emptyMessage);
          toast.error(emptyMessage);
          return;
        }

        checkMealPortionWarning(dayOfWeek, dateStr, dayItems);

        if (overwrite) {
          toast.success(`AI Ä‘Ã£ táº¡o láº¡i thá»±c Ä‘Æ¡n cho ngÃ y ${DAYS[dayOfWeek - 1]}! ðŸ¤–`);
        } else {
          if (addedCount > 0) {
            toast.success(`ÄÃ£ bá»• sung ${addedCount} mÃ³n cÃ²n thiáº¿u cho thá»±c Ä‘Æ¡n.`);
          } else {
            toast.success(`Thá»±c Ä‘Æ¡n Ä‘Ã£ Ä‘Æ°á»£c cáº­p nháº­t.`);
          }
        }
      } else {
        await loadPlan();
        toast.success(`Thá»±c Ä‘Æ¡n Ä‘Ã£ Ä‘Æ°á»£c cáº­p nháº­t.`);
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'CÃ³ lá»—i khi gá»i AI gá»£i Ã½';
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
      toast.error('KhÃ´ng thá»ƒ tá»‘i Æ°u thá»±c Ä‘Æ¡n khi cÃ³ bá»¯a trong ngÃ y Ä‘Ã£ qua.');
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
        prioritizeNew,
        noRepeatIn7Days,
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
          toast.success(`ÄÃ£ tá»‘i Æ°u thá»±c Ä‘Æ¡n: ${details.beforeCount} mÃ³n â†’ ${details.afterCount} mÃ³n`);
          setPortionWarning(null);
        } else {
          let errorMsg = 'KhÃ´ng thá»ƒ tá»‘i Æ°u thá»±c Ä‘Æ¡n lÃºc nÃ y.';
          if (details.errorReason?.startsWith('locked_exceeds_limit:')) {
            const parts = details.errorReason.split(':');
            const lockedCount = parts[1];
            const limitCount = parts[2];
            errorMsg = `KhÃ´ng thá»ƒ tá»‘i Æ°u vÃ¬ cÃ³ ${lockedCount} mÃ³n Ä‘Ã£ bá»‹ khÃ³a, vÆ°á»£t ngÆ°á»¡ng ${limitCount} mÃ³n.`;
          } else if (details.errorReason === 'all_locked') {
            errorMsg = 'MÃ³n Ä‘Ã£ bá»‹ khÃ³a.';
          } else if (details.errorReason === 'nutrition_limit') {
            errorMsg = 'Loáº¡i bá» thÃªm sáº½ gÃ¢y thiáº¿u dinh dÆ°á»¡ng.';
          } else if (details.errorReason === 'not_enough_recipes') {
            errorMsg = 'KhÃ´ng Ä‘á»§ cÃ´ng thá»©c thay tháº¿.';
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
        toast.success('ÄÃ£ tá»± Ä‘á»™ng tá»‘i Æ°u thá»±c Ä‘Æ¡n theo sá»‘ ngÆ°á»i Äƒn.');
        setPortionWarning(null);
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'KhÃ´ng thá»ƒ tá»‘i Æ°u thá»±c Ä‘Æ¡n lÃºc nÃ y';
      console.error('[MealAI][meal-planner][portion optimize] error:', err);
      setOptimizationError(errMsg);
      toast.error(errMsg);
    } finally {
      setOptimizingPortions(false);
    }
  };

  const clearDayPlan = async (dayOfWeek: number) => {
    if (isDayFullyPast(weekStart, dayOfWeek - 1)) { toast.error('NgÃ y nÃ y Ä‘Ã£ qua háº¿t cÃ¡c bá»¯a Äƒn, khÃ´ng thá»ƒ chá»‰nh sá»­a.'); return; }
    if (!plan) return;
    const dayItems = plan.items?.filter((item: any) => item.dayOfWeek === dayOfWeek);
    if (!dayItems || dayItems.length === 0) { toast.error('NgÃ y nÃ y chÆ°a cÃ³ mÃ³n Äƒn nÃ o Ä‘á»ƒ xÃ³a!'); return; }

    // Only delete items in slots that are NOT in the past
    const activeItems = dayItems.filter((item: any) => !isPastMealSlot(weekStart, dayOfWeek - 1, item.mealType));
    if (activeItems.length === 0) { toast.error('Táº¥t cáº£ bá»¯a Äƒn Ä‘Ã£ qua cá»§a ngÃ y nÃ y Ä‘á»u khÃ´ng thá»ƒ xÃ³a!'); return; }

    if (!confirm(`Báº¡n cÃ³ cháº¯c muá»‘n xÃ³a cÃ¡c mÃ³n Äƒn chÆ°a diá»…n ra trong ${DAYS[dayOfWeek - 1]}?`)) return;
    try {
      for (const item of activeItems) await mealPlanAPI.removeItem(plan.id, item.id);
      toast.success(`ÄÃ£ xÃ³a cÃ¡c mÃ³n Äƒn trong cÃ¡c bá»¯a chÆ°a diá»…n ra cá»§a ${DAYS[dayOfWeek - 1]}`);
      loadPlan();
    } catch { toast.error('CÃ³ lá»—i xáº£y ra khi xÃ³a'); }
  };

  const handleOpenSelector = (itemId: string | null, day: number, mealType: string) => {
    if (isPastMealSlot(weekStart, day - 1, mealType)) { toast.error('Bá»¯a Äƒn nÃ y Ä‘Ã£ qua, khÃ´ng thá»ƒ thÃªm hoáº·c Ä‘á»•i mÃ³n ná»¯a.'); return; }
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
        toast.success('ÄÃ£ cáº­p nháº­t mÃ³n Äƒn thÃ nh cÃ´ng!');
      } else {
        const res = await mealPlanAPI.setMealSlot({ weekStart, dayOfWeek: day, mealDate: dateStr, mealType: mealType, recipeId });
        nextPlan = res.data;
        applyPlanUpdateKeepingScroll(res.data);
        toast.success('ÄÃ£ chá»n mÃ³n Äƒn thÃ nh cÃ´ng!');
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
          toast.error(warning.message || 'Báº¡n Ä‘Ã£ vÆ°á»£t sá»‘ lÆ°á»£ng mÃ³n khuyáº¿n nghá»‹ cho sá»‘ ngÆ°á»i Äƒn hiá»‡n táº¡i.', { duration: 5000 });
        }
      }
    } catch { toast.error('KhÃ´ng thá»ƒ cáº­p nháº­t mÃ³n Äƒn'); }
  };

  const handleSelectRecipe = async (recipeId: string) => {
    if (!selectedSlot) return;
    if (isPastSlotDate(weekStart, selectedSlot.day - 1)) { toast.error('KhÃ´ng thá»ƒ thÃªm hoáº·c Ä‘á»•i mÃ³n cho ngÃ y Ä‘Ã£ qua.'); return; }

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
        recipeName: selectedRecipe ? selectedRecipe.name : 'MÃ³n Äƒn',
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
      toast.success(`ÄÃ£ thÃªm ${recipeIds.length} mÃ³n vÃ o ${getMealLabel(mealType)}!`);
      handleCloseSelector();

      const dayItems = res.data.items.filter((item: any) => item.mealDate === dateStr && item.recipe);
      const warning = calculateMealPortionWarning({
        servings: getUserServings(),
        totalDishes: dayItems.length,
        dailyCalories: getUserDailyCalories(),
      }, false);
      if (warning.shouldWarn) {
        toast.error(warning.message || 'Báº¡n Ä‘Ã£ vÆ°á»£t sá»‘ lÆ°á»£ng mÃ³n khuyáº¿n nghá»‹ cho sá»‘ ngÆ°á»i Äƒn hiá»‡n táº¡i.', { duration: 5000 });
      }
    } catch { toast.error('KhÃ´ng thá»ƒ cáº­p nháº­t mÃ³n Äƒn'); }
  };

  const handleAddSelectedRecipes = async () => {
    if (!selectedSlot || selectedSlot.itemId || selectedRecipeIds.length === 0) return;
    if (isPastMealSlot(weekStart, selectedSlot.day - 1, selectedSlot.mealType)) { toast.error('Bá»¯a Äƒn nÃ y Ä‘Ã£ qua, khÃ´ng thá»ƒ thÃªm mÃ³n ná»¯a.'); return; }

    const dateStr = getSlotDateInput(weekStart, selectedSlot.day - 1);
    const dayItems = plan?.items?.filter((item: any) => item.mealDate === dateStr && item.recipe) || [];
    const slotCapacity = getMealSlotCapacity(dayItems, selectedSlot.mealType);
    const currentCount = slotCapacity.currentCount;
    const maxCount = slotCapacity.maxCount;

    if (currentCount + selectedRecipeIds.length > maxCount) {
      const selectedNames = selectedRecipeIds.map(id => {
        const r = searchResults.find((x: any) => x.id === id);
        return r ? r.name : 'MÃ³n Äƒn';
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
    if (isPastMealSlot(weekStart, item.dayOfWeek - 1, item.mealType)) { toast.error('Bá»¯a Äƒn nÃ y Ä‘Ã£ qua, khÃ´ng thá»ƒ xÃ³a mÃ³n ná»¯a.'); return; }
    try {
      await mealPlanAPI.removeItem(plan.id, item.id);
      toast.success('ÄÃ£ xÃ³a mÃ³n Äƒn thÃ nh cÃ´ng!');
      loadPlan();
    } catch { toast.error('KhÃ´ng thá»ƒ xÃ³a mÃ³n Äƒn'); }
  };

  const handleMealItemClick = (item: any) => {
    if (!item?.recipe?.id) return;
    router.push(`/recipes/${item.recipe.id}`);
  };

  const handleToggleMealItem = async (item: any, mealDate: string, mealType: string, isConsumed: boolean) => {
    if (!plan) return;
    if (isPastMealDate(mealDate) || isPastMealSlot(weekStart, item.dayOfWeek - 1, mealType)) {
      toast.error('KhÃ´ng thá»ƒ thay Ä‘á»•i mÃ³n Äƒn cá»§a ngÃ y hoáº·c bá»¯a Ä‘Ã£ qua. Báº¡n chá»‰ cÃ³ thá»ƒ xem chi tiáº¿t mÃ³n.');
      return;
    }

    try {
      await mealPlanAPI.toggleConsume(plan.id, item.id, isConsumed);
      if (isConsumed) {
        toast.success(`ÄÃ£ hoÃ n thÃ nh ${item.recipe?.name || 'bá»¯a Äƒn'} & tá»± Ä‘á»™ng trá»« nguyÃªn liá»‡u tá»§ láº¡nh!`);
      } else {
        toast.success(`ÄÃ£ hoÃ n tÃ¡c hoÃ n thÃ nh ${item.recipe?.name || 'bá»¯a Äƒn'} & hoÃ n láº¡i nguyÃªn liá»‡u!`);
      }
      window.dispatchEvent(new CustomEvent('inventory-updated'));
      loadPlan();
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || 'CÃ³ lá»—i xáº£y ra khi cáº­p nháº­t tráº¡ng thÃ¡i bá»¯a Äƒn');
    }
  };

  const handlePrevWeek = () => {
    const d = parseDateInput(weekStart);
    d.setDate(d.getDate() - 7);
    const prev = formatDateInput(d);
    if (prev < getCurrentWeekStart()) {
      toast.error('Chá»‰ cÃ³ thá»ƒ xem vÃ  táº¡o thá»±c Ä‘Æ¡n tá»« tuáº§n hiá»‡n táº¡i trá»Ÿ Ä‘i.');
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
    MEALS.find((m) => m.key === mealType)?.label || 'bá»¯a Äƒn';

  const getRecipeMeta = (recipe: any, fallbackCalories?: number) => {
    if (recipe?.cookingTime) return `${recipe.cookingTime} phÃºt`;
    if (recipe?.calories || fallbackCalories) return `${recipe?.calories || fallbackCalories} kcal`;
    return null;
  };

  const handleExportPDF = async () => {
    if (!plan) {
      toast.error('ChÆ°a cÃ³ thá»±c Ä‘Æ¡n tuáº§n Ä‘á»ƒ xuáº¥t PDF');
      return;
    }
    const toastId = toast.loading('Äang chuáº©n bá»‹ file PDF thá»±c Ä‘Æ¡n...');
    try {
      const res = await api.get(`/meal-plans/${plan.id}/pdf`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = `thuc_don_tuan_${weekStart}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('ÄÃ£ táº£i xuá»‘ng file PDF thá»±c Ä‘Æ¡n thÃ nh cÃ´ng!', { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error('CÃ³ lá»—i xáº£y ra khi táº£i file PDF', { id: toastId });
    }
  };

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-500">
          Vui lÃ²ng <Link href="/login" className="text-emerald-600 underline">Ä‘Äƒng nháº­p</Link> Ä‘á»ƒ sá»­ dá»¥ng thá»±c Ä‘Æ¡n.
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
              ðŸ“… Thá»±c ÄÆ¡n Tuáº§n Cá»§a Báº¡n
            </h1>
            <p className="text-sm text-gray-500 mt-1">Láº­p lá»‹ch Äƒn uá»‘ng thÃ´ng minh, tá»‘i Æ°u calo & dinh dÆ°á»¡ng</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {plan && (
              <button
                onClick={handleExportPDF}
                className="btn-outline-sm gap-2"
              >
                <HiOutlineDownload className="text-base animate-bounce" />
                Xuáº¥t PDF Thá»±c ÄÆ¡n
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
                aria-label="Tuáº§n trÆ°á»›c"
              >
                <HiChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-bold text-slate-700 px-1 min-w-[140px] text-center select-none">
                {getWeekRangeLabel(weekStart)}
              </span>
              <button
                onClick={handleNextWeek}
                className="flex h-8 w-8 items-center justify-center rounded-brand-sm border border-brand-light-border bg-white text-slate-600 transition-all hover:bg-slate-100 hover:text-slate-900 cursor-pointer shadow-brand-sm"
                aria-label="Tuáº§n sau"
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
        <div className="card-dashboard mb-6 p-4 flex flex-col sm:flex-row sm:items-center gap-4 bg-emerald-50/5 border-brand-primary/20">
          <div className="text-sm font-bold text-slate-700 flex items-center gap-1.5 shrink-0">
            âš™ï¸ TÃ¹y chá»n gá»£i Ã½ AI:
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-slate-600 font-semibold cursor-pointer select-none">
              <input
                type="checkbox"
                checked={prioritizeNew}
                onChange={(e) => setPrioritizeNew(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-brand-primary focus:ring-brand-primary cursor-pointer"
              />
              Æ¯u tiÃªn mÃ³n má»›i
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600 font-semibold cursor-pointer select-none">
              <input
                type="checkbox"
                checked={noRepeatIn7Days}
                onChange={(e) => setNoRepeatIn7Days(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-brand-primary focus:ring-brand-primary cursor-pointer"
              />
              KhÃ´ng láº·p mÃ³n trong 7 ngÃ y
            </label>
          </div>
        </div>

        {/* Loading */}
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-brand-primary" />
              <p className="text-sm">Äang táº£i thá»±c Ä‘Æ¡n...</p>
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
                          ÄÃ£ sá»­ dá»¥ng: {usedDishesCount}/{maxDishesCount} mÃ³n
                        </span>
                      </h2>
                      {isToday && (
                        <span className="rounded-brand-sm bg-brand-primary px-2 py-0.5 text-xs font-semibold text-white">
                          HÃ´m nay
                        </span>
                      )}
                      {isPastMealPlanDate && (
                        <span className="rounded-brand-sm border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                          ÄÃ£ qua
                        </span>
                      )}
                    </div>

                    {/* Actions â€” only show for non-past days */}
                    {!isPastDay && (
                      <div className="flex flex-wrap items-center gap-2">
                        {!isDayFullyPast(weekStart, dayIdx) && (
                          <button
                            onClick={() => handleAISuggestButtonClick(dayOfWeekNumber)}
                            disabled={aiSuggestingDay === dayOfWeekNumber}
                            className="bg-gradient-to-r from-brand-primary to-brand-secondary text-white font-bold rounded-brand-sm shadow-brand-sm hover:shadow-brand-glow hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs border-none outline-none"
                          >
                            <HiSparkles className={`h-3.5 w-3.5 ${aiSuggestingDay === dayOfWeekNumber ? 'animate-spin' : ''}`} />
                            {aiSuggestingDay === dayOfWeekNumber ? 'Äang gá»£i Ã½...' : 'âœ¨ AI Gá»£i Ã'}
                          </button>
                        )}
                        {plan && (
                          <button
                            onClick={() => exportDayToShoppingList(dayOfWeekNumber)}
                            className="btn-outline-sm"
                          >
                            <HiOutlineDownload className="h-3.5 w-3.5" />
                            Táº¡o Danh SÃ¡ch Mua Sáº¯m
                          </button>
                        )}
                        {plan && !isDayFullyPast(weekStart, dayIdx) && (
                          <button
                            onClick={() => clearDayPlan(dayOfWeekNumber)}
                            className="flex h-7 w-7 items-center justify-center rounded-brand-sm border border-brand-danger/30 bg-white text-brand-danger hover:bg-brand-danger/10 transition-all cursor-pointer"
                            aria-label="XÃ³a ngÃ y"
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
                                  ÄÃ£ qua
                                </span>
                              )}
                            </span>
                            {!isPastMealSlot(weekStart, dayIdx, meal.key) && (
                              <button
                                onClick={() => handleOpenSelector(null, dayOfWeekNumber, meal.key)}
                                className="flex items-center gap-0.5 text-xs font-bold text-brand-primary hover:text-brand-primary-hover transition-all cursor-pointer"
                              >
                                <span className="text-sm leading-none">+</span>
                                <span>ThÃªm mÃ³n</span>
                              </button>
                            )}
                          </div>

                          {/* Slot Content */}
                          <div className="p-2 space-y-2">
                            {itemsForSlot.length === 0 ? (
                              <div className="flex min-h-[72px] items-center justify-center">
                                <p className="text-xs text-slate-300">ChÆ°a cÃ³ mÃ³n Äƒn</p>
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
                                        title="ÄÃ¡nh dáº¥u hoÃ n thÃ nh bá»¯a Äƒn"
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
                                          <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">áº¢nh</div>
                                        )}
                                      </div>
                                    </Link>

                                    {/* Recipe Info */}
                                    <div className="min-w-0 flex-1 pr-5">
                                      <Link href={`/recipes/${item.recipe?.id}`} onClick={(e) => e.stopPropagation()}>
                                        <p className="truncate text-xs font-semibold text-slate-800 hover:text-brand-primary transition-all">
                                          {item.recipe?.name || 'MÃ³n Äƒn'}
                                        </p>
                                      </Link>
                                      {getRecipeMeta(item.recipe, item.calories) && (
                                        <p className="text-[10px] text-slate-400">
                                          â€¢ {getRecipeMeta(item.recipe, item.calories)}
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
                                        Äá»•i
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteItem(item);
                                        }}
                                        className="flex-1 rounded-brand-sm border border-brand-danger/30 py-1 text-[10px] font-bold text-brand-danger hover:bg-brand-danger/10 transition-all cursor-pointer"
                                      >
                                        XÃ³a
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
                  Cáº£nh bÃ¡o kháº©u pháº§n thá»±c Ä‘Æ¡n
                </h3>
                <p className="mt-1 text-sm font-medium leading-relaxed text-amber-700">
                  {portionWarning.message}
                </p>
              </div>

              <div className="space-y-4 px-5 py-4 overflow-y-auto flex-1 bg-white">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-brand-sm border border-brand-light-border bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Sá»‘ ngÆ°á»i</p>
                    <p className="mt-1 text-lg font-black text-slate-900">{portionWarning.servings}</p>
                  </div>
                  <div className="rounded-brand-sm border border-brand-light-border bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Sá»‘ mÃ³n</p>
                    <p className="mt-1 text-lg font-black text-slate-900">{portionWarning.totalDishes}</p>
                  </div>
                  <div className="rounded-brand-sm border border-brand-light-border bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-slate-400">NgÆ°á»¡ng</p>
                    <p className="mt-1 text-lg font-black text-slate-900">{portionWarning.maxRecommendedDishes}</p>
                  </div>
                  <div className="rounded-brand-sm border border-brand-light-border bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Kháº©u pháº§n</p>
                    <p className="mt-1 text-lg font-black text-slate-900">{portionWarning.totalPortions}</p>
                  </div>
                </div>

                <div className="rounded-brand-md border border-brand-primary/15 bg-brand-primary/5 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-brand-primary">Tá»•ng calories cáº§n thiáº¿t</p>
                  <p className="mt-1 text-2xl font-black text-slate-900">
                    {portionWarning.totalCaloriesNeeded > 0
                      ? `${portionWarning.totalCaloriesNeeded.toLocaleString('vi-VN')} kcal/ngÃ y`
                      : 'ChÆ°a Ä‘á»§ dá»¯ liá»‡u calories'}
                  </p>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    Há»‡ thá»‘ng sáº½ Æ°u tiÃªn giá»¯ mÃ³n chÃ­nh theo tá»«ng bá»¯a, mÃ³n Ä‘Ã£ khÃ³a vÃ  mÃ³n cÃ³ giÃ¡ trá»‹ dinh dÆ°á»¡ng tá»‘t hÆ¡n khi tá»‘i Æ°u.
                  </p>
                </div>

                {optimizationError && (
                  <div className="rounded-brand-md border border-red-200 bg-red-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-red-700">Lá»—i tá»‘i Æ°u thá»±c Ä‘Æ¡n</p>
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
                  Giá»¯ nguyÃªn
                </button>
                <button
                  onClick={handleOptimizePortions}
                  disabled={optimizingPortions}
                  className="btn-primary-sm justify-center"
                >
                  {optimizingPortions ? 'Äang tá»‘i Æ°u...' : 'Tá»± Ä‘á»™ng tá»‘i Æ°u thá»±c Ä‘Æ¡n'}
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
                  Tá»‘i Æ°u thá»±c Ä‘Æ¡n thÃ nh cÃ´ng! ðŸŽ‰
                </h3>
              </div>

              <div className="space-y-4 px-5 py-4 overflow-y-auto flex-1 bg-white">
                <div className="flex justify-between items-center bg-slate-50 p-4 rounded-brand-md border border-brand-light-border">
                  <div className="text-center flex-1">
                    <p className="text-[10px] font-bold uppercase text-slate-400">TrÆ°á»›c tá»‘i Æ°u</p>
                    <p className="mt-1 text-lg font-black text-slate-700">{optimizationResult.beforeCount} mÃ³n</p>
                  </div>
                  <div className="text-slate-400 font-bold px-2">âž”</div>
                  <div className="text-center flex-1">
                    <p className="text-[10px] font-bold uppercase text-emerald-500">Sau tá»‘i Æ°u</p>
                    <p className="mt-1 text-lg font-black text-emerald-600">{optimizationResult.afterCount} mÃ³n</p>
                  </div>
                </div>

                {optimizationResult.removedItems && optimizationResult.removedItems.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">MÃ³n Ä‘Ã£ loáº¡i bá»:</h4>
                    <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {optimizationResult.removedItems.map((item: any, idx: number) => (
                        <li key={idx} className="text-xs bg-red-50 text-red-700 border border-red-100 px-3 py-2.5 rounded-brand-sm flex justify-between items-center">
                          <span className="font-semibold">{item.recipeName}</span>
                          <span className="text-[9px] bg-red-100 px-2 py-0.5 rounded-full font-bold uppercase">
                            {item.mealType === 'breakfast' ? 'SÃ¡ng' : item.mealType === 'lunch' ? 'TrÆ°a' : 'Tá»‘i'}
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
                  Äá»“ng Ã½
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
            recipeName={manualAddWarningModal.recipeName || 'MÃ³n Äƒn'}
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
                    Chá»n mÃ³n â€” {selectedSlot ? `${getMealLabel(selectedSlot.mealType)}, ${DAYS[selectedSlot.day - 1]}` : ''}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">TÃ¬m vÃ  chá»n cÃ´ng thá»©c muá»‘n thÃªm vÃ o thá»±c Ä‘Æ¡n.</p>
                </div>
                <button
                  onClick={handleCloseSelector}
                  className="btn-ghost-sm"
                >
                  ÄÃ³ng
                </button>
              </div>

              {/* Search */}
              <div className="border-b border-brand-light-border px-5 py-3 bg-slate-50/50">
                <input
                  type="text"
                  placeholder="Nháº­p tÃªn mÃ³n Äƒn Ä‘á»ƒ tÃ¬m kiáº¿m..."
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
                    <p className="text-sm">Äang tÃ¬m cÃ´ng thá»©c...</p>
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    <p className="text-sm font-medium">KhÃ´ng tÃ¬m tháº¥y mÃ³n Äƒn phÃ¹ há»£p</p>
                    <p className="mt-1 text-xs">HÃ£y thá»­ tÃªn mÃ³n khÃ¡c.</p>
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
                            <p className="text-sm font-medium">KhÃ´ng cÃ³ mÃ³n Äƒn phÃ¹ há»£p (cÃ¡c mÃ³n khÃ¡c Ä‘Ã£ cÃ³ trong thá»±c Ä‘Æ¡n ngÃ y hÃ´m nay)</p>
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
                                <div className="flex h-full w-full items-center justify-center bg-gray-100 text-xs text-gray-400">áº¢nh</div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-800">{recipe.name}</p>
                              <p className="text-xs text-slate-400 mt-0.5">
                                {recipe.calories ? `${recipe.calories} kcal` : ''}
                                {recipe.cookingTime ? ` Â· ${recipe.cookingTime} phÃºt` : ''}
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
                              aria-label={`Chá»n ${recipe.name}`}
                            />
                          ) : (
                            <button
                              onClick={() => handleSelectRecipe(recipe.id)}
                              className="btn-primary-sm shrink-0"
                            >
                              Chá»n
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
                    ? `ÄÃ£ chá»n ${selectedRecipeIds.length} mÃ³n`
                    : 'CÃ³ thá»ƒ chá»n nhiá»u mÃ³n cÃ¹ng lÃºc'}
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={handleCloseSelector}
                    className="btn-ghost-sm inline-flex"
                  >
                    Há»§y bá»
                  </button>
                  {!selectedSlot?.itemId && (
                    <button
                      onClick={handleAddSelectedRecipes}
                      disabled={selectedRecipeIds.length === 0}
                      className={`btn-primary-sm inline-flex ${
                        selectedRecipeIds.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      ThÃªm {selectedRecipeIds.length} mÃ³n Ä‘Ã£ chá»n
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
