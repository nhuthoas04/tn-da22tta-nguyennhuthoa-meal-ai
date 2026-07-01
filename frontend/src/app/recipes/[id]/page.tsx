'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { recipesAPI, mealPlanAPI, favoritesAPI } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';
import { HiClock, HiFire, HiHeart, HiOutlineHeart, HiUsers, HiArrowLeft, HiCalendar, HiX, HiStar } from 'react-icons/hi';
import Link from 'next/link';
import RecipeImage from '@/components/RecipeImage';
import AllergyWarningModal from '@/components/AllergyWarningModal';
import MealLimitWarningModal from '@/components/MealLimitWarningModal';
import { checkMealPlanWarnings } from '@/lib/mealPortion';

const MEAL_OPTIONS = [
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

const NUTRITION_ITEMS = [
  { key: 'calories', label: 'Calories', unit: 'kcal', color: 'bg-brand-warning', max: 800 },
  { key: 'protein', label: 'Protein', unit: 'g', color: 'bg-brand-secondary', max: 50 },
  { key: 'carbs', label: 'Carbs', unit: 'g', color: 'bg-amber-500', max: 100 },
  { key: 'fat', label: 'Fat', unit: 'g', color: 'bg-brand-danger', max: 40 },
];

function RecipeMetaBadge({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-brand-sm border border-brand-light-border bg-white px-3 py-2 text-sm shadow-brand-sm">
      <span className="text-lg text-brand-primary">{icon}</span>
      <span className="text-slate-500">{label}</span>
      <span className="font-bold text-slate-900">{value}</span>
    </div>
  );
}

function SectionHeader({ number, title, subtitle }: { number: string; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-primary text-sm font-bold text-white shadow-brand-sm">
          {number}
        </span>
        <h2 className="text-xl font-bold text-slate-950">{title}</h2>
      </div>
      {subtitle && <p className="text-sm font-medium text-slate-500">{subtitle}</p>}
    </div>
  );
}

export default function RecipeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [recipe, setRecipe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isFav, setIsFav] = useState(false);
  const [favoriteSubmitting, setFavoriteSubmitting] = useState(false);
  const [servings, setServings] = useState<number>(4);

  const [planSelectorOpen, setPlanSelectorOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => formatDateInput(new Date()));
  const [selectedMeal, setSelectedMeal] = useState('breakfast');
  const [submitting, setSubmitting] = useState(false);
  const [allergyWarningModal, setAllergyWarningModal] = useState<{
    recipeName: string;
    matchedAllergens: string[];
    onConfirm: () => void | Promise<void>;
  } | null>(null);
  const [isAddingWithAllergy, setIsAddingWithAllergy] = useState(false);
  const [manualAddWarningModal, setManualAddWarningModal] = useState<{
    servings: number;
    currentCount: number;
    maxCount: number;
    recipeName: string;
    warnings: any;
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  useEffect(() => {
    if (planSelectorOpen && selectedDate) {
      setSelectedMeal(getFirstAvailableMeal(selectedDate));
    }
  }, [selectedDate, planSelectorOpen]);

  // Ratings state
  const [ratings, setRatings] = useState<any[]>([]);
  const [totalRatings, setTotalRatings] = useState(0);
  const [userRating, setUserRating] = useState<number>(5);
  const [userReview, setUserReview] = useState<string>('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [editingRatingId, setEditingRatingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [editingScore, setEditingScore] = useState<number>(5);

  // Replies state
  const [replyingRatingId, setReplyingRatingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<string>('');
  const [submittingReply, setSubmittingReply] = useState(false);

  const saveToRecentlyViewed = (rec: any) => {
    try {
      const storageKey = user ? `recently-viewed-${user.id}` : 'recently-viewed-guest';
      const rawData = localStorage.getItem(storageKey);
      let list: any[] = rawData ? JSON.parse(rawData) : [];

      list = list.filter((item: any) => item.id !== rec.id);

      list.unshift({
        id: rec.id,
        name: rec.name,
        imageUrl: rec.imageUrl,
        viewedAt: new Date().toISOString(),
      });

      if (list.length > 20) {
        list = list.slice(0, 20);
      }

      localStorage.setItem(storageKey, JSON.stringify(list));
    } catch (err) {
      console.error('Error saving to recently viewed:', err);
    }
  };

  const loadRecipeDetails = async () => {
    const recipeId = params.id;
    if (!recipeId || Array.isArray(recipeId)) return;
    try {
      const res = await recipesAPI.getById(recipeId);
      const nextRecipe = res.data;
      console.log(nextRecipe.imageUrl);

      setRecipe(nextRecipe);
      setIsFav(Boolean(nextRecipe.isFavorite ?? nextRecipe.isFavorited));
      const profileServings = (user as any)?.preferences?.servings;
      setServings(profileServings || nextRecipe.servings || 4);

      // Save recipe to recently viewed list
      saveToRecentlyViewed(nextRecipe);
    } catch (err: any) {
      console.error('Recipe detail request failed:', {
        recipeId,
        status: err.response?.status,
        data: err.response?.data,
        message: err.message,
      });
      toast.error(err.response?.data?.message || 'Không tìm thấy công thức');
    }
  };

  const loadRatings = async () => {
    const recipeId = params.id;
    if (!recipeId || Array.isArray(recipeId)) return;
    try {
      const res = await recipesAPI.getRatings(recipeId);
      setRatings(res.data.data || []);
      setTotalRatings(res.data.total || 0);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadRecipeDetails(), loadRatings()]);
      setLoading(false);
    };
    init();
  }, [params.id, user?.id]);

  const handleRatingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('Vui lòng đăng nhập để gửi đánh giá');
      return;
    }
    setSubmittingRating(true);
    try {
      const response = await recipesAPI.createRating(recipe.id, {
        rating: userRating,
        review: userReview,
      });
      if (response.data.isFlagged) {
        toast(
          'Nội dung đánh giá có từ ngữ không phù hợp và đã được gửi đến quản trị viên xem xét.',
        );
      } else {
        toast.success('Gửi đánh giá thành công.');
      }
      setUserReview('');
      setUserRating(5);
      await Promise.all([loadRecipeDetails(), loadRatings()]);
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Có lỗi xảy ra khi gửi đánh giá');
    } finally {
      setSubmittingRating(false);
    }
  };

  const startEditing = (r: any) => {
    setEditingRatingId(r.id);
    setEditingScore(r.rating);
    setEditingText(r.isFlagged ? '' : r.review);
  };

  const handleUpdateRating = async (ratingId: string) => {
    try {
      const response = await recipesAPI.updateRating(recipe.id, ratingId, {
        rating: editingScore,
        review: editingText,
      });
      if (response.data.isFlagged) {
        toast(
          'Nội dung đánh giá có từ ngữ không phù hợp và đã được gửi đến quản trị viên xem xét.',
        );
      } else {
        toast.success('Đã cập nhật đánh giá thành công!');
      }
      setEditingRatingId(null);
      await Promise.all([loadRecipeDetails(), loadRatings()]);
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Có lỗi xảy ra khi cập nhật');
    }
  };

  const handleDeleteRating = async (ratingId: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa đánh giá này không?')) return;
    try {
      await recipesAPI.deleteRating(recipe.id, ratingId);
      toast.success('Đã xóa đánh giá thành công!');
      await Promise.all([loadRecipeDetails(), loadRatings()]);
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Có lỗi xảy ra khi xóa đánh giá');
    }
  };

  const toggleFav = async () => {
    if (!user) {
      toast.error('Vui lòng đăng nhập');
      return;
    }

    if (!recipe?.id) {
      toast.error('Không xác định được công thức cần yêu thích');
      return;
    }

    if (favoriteSubmitting) return;

    const tokenExists = typeof window !== 'undefined' && !!localStorage.getItem('accessToken');
    const favoriteRequest = isFav
      ? {
          method: 'delete',
          url: `/favorites/${recipe.id}`,
          payload: null,
        }
      : {
          method: 'post',
          url: '/favorites',
          payload: { recipeId: recipe.id },
        };

    console.log({
      recipeId: recipe?.id,
      userId: user?.id,
      isFav,
      tokenExists,
      request: favoriteRequest,
    });

    setFavoriteSubmitting(true);
    try {
      const res = isFav
        ? await favoritesAPI.remove(recipe.id)
        : await favoritesAPI.add(recipe.id);
      const nextIsFavorite = Boolean(res.data.isFavorite ?? res.data.isFavorited);
      setIsFav(nextIsFavorite);
      setRecipe((prev: any) => prev ? {
        ...prev,
        isFavorite: nextIsFavorite,
        isFavorited: nextIsFavorite,
        favoriteCount: res.data.favoriteCount ?? prev.favoriteCount ?? 0,
      } : prev);
      toast.success(res.data.message);
    } catch (err: any) {
      console.error('Favorite update failed:', {
        status: err.response?.status,
        data: err.response?.data,
        message: err.message,
        url: err.config?.url,
        method: err.config?.method,
        baseURL: err.config?.baseURL,
        requestPayload: err.config?.data,
        recipeId: recipe?.id,
        userId: user?.id,
        action: isFav ? 'remove' : 'add',
        tokenExists,
        expectedRequest: favoriteRequest,
      });
      toast.error(err.response?.data?.message || err.message || 'Không thể cập nhật yêu thích');
    } finally {
      setFavoriteSubmitting(false);
    }
  };

  const handleReplySubmit = async (parentId: string) => {
    if (!user) {
      toast.error('Vui lòng đăng nhập để gửi phản hồi');
      return;
    }
    if (!replyText.trim()) {
      toast.error('Nội dung phản hồi không được để trống');
      return;
    }
    setSubmittingReply(true);
    try {
      const response = await recipesAPI.createReply(recipe.id, parentId, { review: replyText });
      if (response.data.isFlagged) {
        toast(
          'Nội dung phản hồi có từ ngữ không phù hợp và đã được gửi đến quản trị viên xem xét.',
        );
      } else {
        toast.success('Đã gửi phản hồi thành công!');
      }
      setReplyText('');
      setReplyingRatingId(null);
      await loadRatings();
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Có lỗi xảy ra khi gửi phản hồi');
    } finally {
      setSubmittingReply(false);
    }
  };

  const openPlanSelector = () => {
    if (!user) {
      toast.error('Vui lòng đăng nhập để thêm vào thực đơn');
      return;
    }
    let defaultDate = getTodayInputValue();
    if (selectedDate < defaultDate) {
      setSelectedDate(defaultDate);
    } else {
      defaultDate = selectedDate;
    }
    setSelectedMeal(getFirstAvailableMeal(defaultDate));
    setPlanSelectorOpen(true);
  };

  const handleAddToPlan = async (forceAdd = false, bypassWarnings = false) => {
    if (!user) {
      toast.error('Vui lòng đăng nhập để thực hiện');
      return;
    }
    if (selectedDate < getTodayInputValue()) {
      toast.error('Không thể thêm món vào ngày đã qua');
      setSelectedDate(getTodayInputValue());
      return;
    }
    if (isPastMealSlot(selectedDate, selectedMeal)) {
      toast.error('Bữa ăn này đã qua, không thể thêm món ăn nữa.');
      return;
    }

    const targetWeekStart = getMonday(parseDateInput(selectedDate));
    const targetDayOfWeek = getMealPlanDay(parseDateInput(selectedDate));

    if (forceAdd) {
      setIsAddingWithAllergy(true);
    } else {
      setSubmitting(true);
    }
    try {
      if (!bypassWarnings) {
        // Fetch current plan to check warnings
        const planRes = await mealPlanAPI.get(targetWeekStart);
        const plan = planRes.data;
        const dayItems = plan?.items?.filter((item: any) => item.mealDate === selectedDate && item.recipe) || [];
        const mealItems = dayItems.filter((item: any) => item.mealType === selectedMeal);

        const peopleCount = Number((user as any)?.servings || (user as any)?.preferences?.servings || 1);
        const tdee = Number(
          (user as any)?.adjustedDailyCalorieTarget ||
          (user as any)?.dailyCalorieTarget ||
          (user as any)?.preferences?.dailyCalorieTarget ||
          2000,
        );

        const warnings = checkMealPlanWarnings({
          peopleCount,
          tdee,
          mealType: selectedMeal,
          currentDayItems: dayItems,
          currentMealItems: mealItems,
          newRecipes: [recipe],
        });

        if (warnings.exceedDishLimit || warnings.exceedDayCalories || warnings.exceedMealCalories) {
          setSubmitting(false);
          setManualAddWarningModal({
            servings: peopleCount,
            currentCount: warnings.currentDishCount,
            maxCount: warnings.maxDishCount,
            recipeName: recipe.name || 'Món ăn',
            warnings,
            onConfirm: async () => {
              setManualAddWarningModal(null);
              await handleAddToPlan(forceAdd, true);
            }
          });
          return;
        }
      }

      await mealPlanAPI.setMealSlot({
        weekStart: targetWeekStart,
        dayOfWeek: targetDayOfWeek,
        mealType: selectedMeal,
        recipeId: recipe.id,
        forceAdd,
      });
      toast.success(`Đã thêm "${recipe.name}" vào thực đơn thành công!`);
      setPlanSelectorOpen(false);
      setAllergyWarningModal(null);
      const params = new URLSearchParams({
        weekStart: targetWeekStart,
        day: String(targetDayOfWeek),
        meal: selectedMeal,
      });
      router.push(`/meal-planner?${params.toString()}`);
    } catch (err: any) {
      console.error(err);
      if (err.response?.data?.type === 'ALLERGY_WARNING') {
        const recipeName = recipe.name || 'Món ăn';
        const matchedAllergens = err.response.data.matchedAllergens || [];
        setAllergyWarningModal({
          recipeName,
          matchedAllergens,
          onConfirm: async () => {
            await handleAddToPlan(true, true);
          }
        });
      } else {
        toast.error('Không thể thêm món ăn vào thực đơn');
      }
    } finally {
      setSubmitting(false);
      setIsAddingWithAllergy(false);
    }
  };

  const setQuickDate = (offset: number) => {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + offset);
    setSelectedDate(formatDateInput(nextDate));
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl border h-96 animate-pulse" />
      </div>
    );
  }

  if (!recipe) return <div className="text-center py-20 text-gray-500">Không tìm thấy</div>;

  const todayValue = formatDateInput(new Date());
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
  const ratingCount = Number(recipe.totalRatings ?? totalRatings ?? 0);
  const averageRating = Number(recipe.averageRating || 0);
  const mealTypeLabels = getMealTypeLabels(recipe.mealType);

  return (
    <div className="min-h-screen bg-brand-light-bg">
      <div className="mx-auto max-w-7xl space-y-6 px-3 py-4 sm:px-6 sm:py-6">
        <Link href="/recipes" className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-brand-sm ring-1 ring-brand-light-border transition hover:text-brand-primary">
          <HiArrowLeft /> Trở lại danh sách
        </Link>

        <section className="overflow-hidden rounded-brand-lg border border-brand-light-border bg-white shadow-brand-md">
          <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="relative min-h-[280px] bg-slate-100 sm:min-h-[420px]">
              <RecipeImage
                src={recipe.imageUrl}
                alt={recipe.name}
                className="h-full w-full object-cover"
                fallbackClassName="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-emerald to-brand-teal text-white"
                iconClassName="text-8xl animate-brand-float"
              />
              <div className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-brand-primary shadow-brand-sm">
                MealAI Recipe
              </div>
            </div>

            <div className="flex flex-col justify-between gap-6 p-5 sm:p-8">
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {recipe.cuisineRegion && (
                    <span className="rounded-full border border-brand-primary/20 bg-brand-primary/10 px-3 py-1 text-xs font-bold text-brand-primary">
                      {recipe.cuisineRegion}
                    </span>
                  )}
                  {recipe.difficulty && (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                      {getDifficultyLabel(recipe.difficulty)}
                    </span>
                  )}
                  {mealTypeLabels.map((label) => (
                    <span key={label} className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                      Phù hợp bữa {label}
                    </span>
                  ))}
                </div>

                <div>
                  <h1 className="text-3xl font-extrabold leading-tight text-slate-950 sm:text-4xl">{recipe.name}</h1>
                  <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                    {recipe.description || 'Công thức được MealAI tổng hợp để hỗ trợ lập thực đơn gia đình, cân bằng nguyên liệu và dinh dưỡng.'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <RecipeMetaBadge icon={<HiClock />} label="Thời gian" value={`${recipe.cookingTime || 0} phút`} />
                  <RecipeMetaBadge icon={<HiFire />} label="Năng lượng" value={`${Number(recipe.calories || 0).toLocaleString('vi-VN')} kcal`} />
                  <RecipeMetaBadge icon={<HiUsers />} label="Khẩu phần" value={`${servings} người`} />
                  <RecipeMetaBadge icon={<HiStar className="text-amber-400" />} label="Đánh giá" value={ratingCount > 0 ? `${averageRating.toFixed(1)} (${ratingCount})` : 'Chưa có'} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button onClick={openPlanSelector} className="btn-primary h-12 justify-center text-base">
                  <HiCalendar className="text-lg" />
                  Thêm vào thực đơn
                </button>
                <button
                  onClick={toggleFav}
                  disabled={favoriteSubmitting}
                  className={`inline-flex h-12 items-center justify-center gap-2 rounded-brand-sm border px-4 text-sm font-bold transition-all ${
                    isFav
                      ? 'border-brand-danger/30 bg-red-50 text-brand-danger shadow-brand-sm'
                      : 'border-brand-light-border bg-white text-slate-700 hover:border-brand-danger/30 hover:bg-red-50/40 hover:text-brand-danger'
                  } ${favoriteSubmitting ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                  aria-label="Yêu thích"
                >
                  {isFav ? <HiHeart className="text-xl" /> : <HiOutlineHeart className="text-xl" />}
                  {isFav ? 'Đã yêu thích' : 'Yêu thích'}
                </button>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_390px]">
          <main className="space-y-6">
            <section className="rounded-brand-lg border border-brand-light-border bg-white p-5 shadow-brand-sm sm:p-6">
              <SectionHeader number="1" title="Nguyên liệu" subtitle={`Quy đổi cho ${servings} người`} />
              <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-500">
                  Tích chọn nguyên liệu khi chuẩn bị để dễ theo dõi quá trình nấu.
                </p>
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-brand-light-border bg-slate-50 p-1 shadow-brand-sm">
                  <button
                    type="button"
                    onClick={() => setServings(prev => Math.max(1, prev - 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-bold text-slate-700 shadow-brand-sm transition hover:text-brand-primary"
                    aria-label="Giảm khẩu phần"
                  >
                    -
                  </button>
                  <span className="min-w-16 text-center text-sm font-bold text-slate-900">{servings} người</span>
                  <button
                    type="button"
                    onClick={() => setServings(prev => Math.min(20, prev + 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-bold text-slate-700 shadow-brand-sm transition hover:text-brand-primary"
                    aria-label="Tăng khẩu phần"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="mt-5 overflow-hidden rounded-brand-md border border-brand-light-border">
                {ingredients.length === 0 ? (
                  <div className="p-5 text-sm text-slate-500">Công thức này chưa có dữ liệu nguyên liệu.</div>
                ) : (
                  ingredients.map((ing: any, i: number) => (
                    <label key={`${ing.name || 'ingredient'}-${i}`} className="flex cursor-pointer items-center justify-between gap-4 border-b border-brand-light-border bg-white px-4 py-3 last:border-b-0 hover:bg-brand-primary/5">
                      <span className="flex min-w-0 items-center gap-3">
                        <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-primary focus:ring-brand-primary" />
                        <span className="truncate text-sm font-semibold text-slate-800">{ing.name || 'Nguyên liệu'}</span>
                      </span>
                      <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700">
                        {formatIngredientQuantity(ing.quantity, recipe.servings, servings)} {ing.unit || ''}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-brand-lg border border-brand-light-border bg-white p-5 shadow-brand-sm sm:p-6">
              <SectionHeader number="2" title="Cách nấu" subtitle={`${steps.length || 0} bước thực hiện`} />
              <ol className="mt-5 space-y-4">
                {steps.length === 0 ? (
                  <li className="rounded-brand-md border border-dashed border-brand-light-border bg-slate-50 p-5 text-sm text-slate-500">
                    Công thức này chưa có hướng dẫn chế biến.
                  </li>
                ) : (
                  steps.map((step: any, i: number) => (
                    <li key={`${step.step || i}-${i}`} className="rounded-brand-md border border-brand-light-border bg-slate-50/60 p-4">
                      <div className="flex gap-4">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-primary text-sm font-extrabold text-white shadow-brand-sm">
                          {step.step || i + 1}
                        </span>
                        <div className="min-w-0">
                          <h3 className="font-bold text-slate-900">Bước {step.step || i + 1}</h3>
                          <p className="mt-1 whitespace-pre-line text-sm leading-7 text-slate-700">
                            {step.description || step.content || 'Chưa có mô tả bước nấu.'}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))
                )}
              </ol>
            </section>

            {/* Đánh giá & Bình luận */}
            <section className="rounded-brand-lg border border-brand-light-border bg-white p-5 shadow-brand-sm sm:p-6">
              <div className="flex flex-col gap-4 border-b border-brand-light-border pb-5 sm:flex-row sm:items-center sm:justify-between">
                <SectionHeader number="3" title="Đánh giá & Bình luận" subtitle={`${totalRatings} lượt đánh giá`} />
                <div className="flex items-center gap-2 rounded-brand-md bg-amber-50 px-4 py-2 text-amber-700">
                  <span className="text-2xl font-extrabold">{averageRating > 0 ? averageRating.toFixed(1) : '0.0'}</span>
                  <div>
                    <div className="flex">
                      {Array.from({ length: 5 }).map((_, idx) => (
                        <HiStar key={idx} className={idx < Math.round(averageRating) ? 'text-amber-400' : 'text-amber-200'} />
                      ))}
                    </div>
                    <p className="text-xs font-bold text-amber-700">{ratingCount > 0 ? `${ratingCount} đánh giá` : 'Chưa có đánh giá'}</p>
                  </div>
                </div>
              </div>

        {/* Form viết đánh giá */}
        {user ? (
          <form onSubmit={handleRatingSubmit} className="mt-5 space-y-4 rounded-brand-md border border-brand-light-border bg-slate-50 p-4">
            <h3 className="font-bold text-slate-800 text-sm">Viết đánh giá của bạn</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-bold mr-2">Đánh giá:</span>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setUserRating(star)}
                    className="p-0.5 transition hover:scale-110 cursor-pointer"
                  >
                    <HiStar
                      className={`text-2xl transition-all ${
                        star <= userRating ? 'text-amber-400' : 'text-slate-300 hover:text-amber-200'
                      }`}
                    />
                  </button>
                ))}
              </div>
              <span className="text-xs text-amber-600 font-bold ml-2">
                {userRating === 5 ? 'Tuyệt vời!' : userRating === 4 ? 'Rất ngon' : userRating === 3 ? 'Bình thường' : userRating === 2 ? 'Tạm ổn' : 'Không thích'}
              </span>
            </div>

            <div className="space-y-1">
              <textarea
                value={userReview}
                onChange={(e) => setUserReview(e.target.value)}
                placeholder="Chia sẻ cảm nhận của bạn về món ăn này (hương vị, độ khó, lưu ý khi nấu...)"
                rows={3}
                className="w-full text-sm rounded-brand-sm border border-brand-light-border p-3 shadow-brand-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/10 placeholder-slate-400 bg-white"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submittingRating}
                className="btn-primary"
              >
                {submittingRating ? 'Đang gửi...' : 'Gửi Đánh Giá'}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-5 rounded-brand-md border border-dashed border-brand-light-border bg-slate-50 py-6 text-center">
            <p className="text-sm text-slate-500">Vui lòng đăng nhập để đánh giá món ăn này.</p>
          </div>
        )}

        <div className="mt-5 space-y-4 divide-y divide-brand-light-border">
          {ratings.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-6">Chưa có bình luận nào cho món ăn này. Hãy là người đầu tiên chia sẻ cảm nhận!</p>
          ) : (
            ratings.map((r) => {
              const isOwner = user && r.user?.id === user.id;
              const isAdmin = user && (user as any).role === 'admin';
              const isEditing = editingRatingId === r.id;

              return (
                <div key={r.id} className="pt-4 first:pt-0 flex flex-col gap-2 animate-fade-in">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-brand-primary/10 flex items-center justify-center font-bold text-brand-primary text-sm overflow-hidden border border-brand-primary/10">
                        {r.user?.avatarUrl ? (
                          <img src={r.user.avatarUrl} alt={r.user.fullName} className="w-9 h-9 rounded-full object-cover" />
                        ) : (
                          r.user?.fullName?.charAt(0).toUpperCase() || 'U'
                        )}
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-900 text-sm">{r.user?.fullName || 'Người dùng ẩn danh'}</h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className="flex">
                            {Array.from({ length: 5 }).map((_, idx) => (
                              <HiStar
                                key={idx}
                                className={`text-sm ${
                                  idx < (isEditing ? editingScore : r.rating) ? 'text-amber-400' : 'text-slate-200'
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-xs text-slate-400 font-medium">
                            {new Date(r.createdAt).toLocaleDateString('vi-VN')}
                          </span>
                          {r.isFlagged && (
                            <span className="px-1.5 py-0.5 rounded-brand-sm text-[9px] bg-amber-50 text-amber-700 font-bold border border-amber-200">
                              Nội dung đã được che
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions: Reply / Edit / Delete */}
                    {!isEditing && (
                      <div className="flex items-center gap-3 text-xs">
                        {user && (
                          <button
                            onClick={() => {
                              setReplyingRatingId(replyingRatingId === r.id ? null : r.id);
                              setReplyText('');
                            }}
                            className="text-slate-500 hover:text-brand-primary transition font-bold cursor-pointer"
                          >
                            {replyingRatingId === r.id ? 'Hủy' : 'Trả lời'}
                          </button>
                        )}
                        {(isOwner || isAdmin) && (
                          <>
                            {isOwner && (
                              <button
                                onClick={() => startEditing(r)}
                                className="text-slate-500 hover:text-brand-primary transition font-bold cursor-pointer"
                              >
                                Sửa
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteRating(r.id)}
                              className="text-brand-danger hover:text-red-600 transition font-bold cursor-pointer"
                            >
                              Xóa
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="mt-2 space-y-2 bg-slate-50 p-3 rounded-brand-sm border border-brand-light-border">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-xs text-slate-500 font-bold">Đánh giá lại:</span>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setEditingScore(star)}
                            className="p-0.5 cursor-pointer"
                          >
                            <HiStar
                              className={`text-lg transition-all ${
                                star <= editingScore ? 'text-amber-400' : 'text-slate-300'
                              }`}
                            />
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        className="w-full text-sm rounded-brand-sm border border-brand-light-border p-2 shadow-brand-sm outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/10 bg-white"
                        rows={2}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setEditingRatingId(null)}
                          className="px-2.5 py-1 text-xs border border-brand-light-border rounded-brand-sm hover:bg-slate-100 transition-all font-bold text-slate-650 cursor-pointer"
                        >
                          Hủy
                        </button>
                        <button
                          onClick={() => handleUpdateRating(r.id)}
                          className="px-2.5 py-1 text-xs bg-brand-primary text-white rounded-brand-sm hover:bg-brand-primary-hover transition-all font-bold cursor-pointer"
                        >
                          Lưu
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-700 text-sm pl-12 whitespace-pre-line leading-relaxed font-medium">
                      {r.review || <span className="text-slate-400 italic font-normal">Không có nhận xét bằng văn bản.</span>}
                    </p>
                  )}

                  {/* Reply Input Form */}
                  {replyingRatingId === r.id && (
                    <div className="ml-12 mt-2 space-y-2 bg-slate-50 p-3 rounded-brand-sm border border-brand-light-border animate-fade-in">
                      <h5 className="text-xs font-bold text-slate-750">Trả lời bình luận của {r.user?.fullName}</h5>
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Nhập nội dung phản hồi của bạn..."
                        className="w-full text-xs rounded-brand-sm border border-brand-light-border p-2.5 shadow-brand-sm outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/10 bg-white"
                        rows={2}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setReplyingRatingId(null)}
                          className="px-2.5 py-1 text-[10px] border border-brand-light-border rounded-brand-sm hover:bg-slate-100 transition-all font-bold text-slate-650 cursor-pointer"
                        >
                          Hủy
                        </button>
                        <button
                          onClick={() => handleReplySubmit(r.id)}
                          disabled={submittingReply}
                          className="px-3 py-1 text-[10px] bg-brand-primary text-white rounded-brand-sm hover:bg-brand-primary-hover transition-all font-bold cursor-pointer"
                        >
                          {submittingReply ? 'Đang gửi...' : 'Gửi'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Replies list */}
                  {r.replies && r.replies.length > 0 && (
                    <div className="ml-12 mt-2 space-y-2.5 pl-4 border-l-2 border-slate-100">
                      {r.replies.map((rep: any) => (
                        <div key={rep.id} className="flex flex-col gap-1 bg-slate-50/50 p-2.5 rounded-brand-sm border border-brand-light-border animate-fade-in">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-brand-primary/10 flex items-center justify-center font-bold text-[10px] text-brand-primary overflow-hidden border border-brand-primary/10">
                              {rep.user?.avatarUrl ? (
                                <img src={rep.user.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                              ) : (
                                rep.user?.fullName?.charAt(0).toUpperCase() || 'U'
                              )}
                            </div>
                            <span className="text-xs font-bold text-slate-900">{rep.user?.fullName || 'Người dùng ẩn danh'}</span>
                            <span className="text-[10px] text-slate-400 font-medium">
                              {new Date(rep.createdAt).toLocaleDateString('vi-VN')}
                            </span>
                          </div>
                          <p className="text-xs text-slate-700 leading-relaxed font-semibold pl-8">{rep.review}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
              </div>
            </section>
          </main>

          <aside className="space-y-4 lg:sticky lg:top-24">
            <section className="rounded-brand-lg border border-brand-light-border bg-white p-5 shadow-brand-sm">
              <h2 className="text-lg font-bold text-slate-950">Thông tin dinh dưỡng</h2>
              <p className="mt-1 text-sm text-slate-500">Ước tính cho một khẩu phần món ăn.</p>
              <div className="mt-5 space-y-4">
                {NUTRITION_ITEMS.map((item) => {
                  const value = Number(recipe[item.key] || 0);
                  const pct = Math.min(100, (value / item.max) * 100);

                  return (
                    <div key={item.key}>
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <span className="font-semibold text-slate-600">{item.label}</span>
                        <span className="font-extrabold text-slate-950">
                          {value.toLocaleString('vi-VN')} {item.unit}
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                        <div className={`${item.color} h-full rounded-full transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-brand-lg border border-brand-light-border bg-white p-5 shadow-brand-sm">
              <h2 className="text-lg font-bold text-slate-950">Tóm tắt nhanh</h2>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between border-b border-brand-light-border pb-3">
                  <span className="text-slate-500">Thời gian nấu</span>
                  <span className="font-bold text-slate-900">{recipe.cookingTime || 0} phút</span>
                </div>
                <div className="flex items-center justify-between border-b border-brand-light-border pb-3">
                  <span className="text-slate-500">Khẩu phần gốc</span>
                  <span className="font-bold text-slate-900">{recipe.servings || 4} người</span>
                </div>
                <div className="flex items-center justify-between border-b border-brand-light-border pb-3">
                  <span className="text-slate-500">Độ khó</span>
                  <span className="font-bold text-slate-900">{getDifficultyLabel(recipe.difficulty)}</span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="text-slate-500">Phù hợp</span>
                  <span className="text-right font-bold text-slate-900">
                    {mealTypeLabels.length > 0 ? mealTypeLabels.join(', ') : 'Nhiều bữa'}
                  </span>
                </div>
              </div>
            </section>

            <section className="rounded-brand-lg border border-brand-primary/20 bg-gradient-to-br from-brand-primary to-brand-teal p-5 text-white shadow-brand-md">
              <h2 className="text-lg font-bold">Hành động</h2>
              <p className="mt-1 text-sm text-white/80">Lưu công thức hoặc đưa món này vào thực đơn tuần.</p>
              <div className="mt-5 space-y-3">
                <button onClick={openPlanSelector} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-brand-sm bg-white px-4 text-sm font-extrabold text-brand-primary shadow-brand-sm transition hover:bg-brand-light-bg">
                  <HiCalendar className="text-lg" />
                  Thêm vào thực đơn
                </button>
                <button
                  onClick={toggleFav}
                  disabled={favoriteSubmitting}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-brand-sm border border-white/30 bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/20 disabled:opacity-70"
                >
                  {isFav ? <HiHeart className="text-xl" /> : <HiOutlineHeart className="text-xl" />}
                  {isFav ? 'Bỏ yêu thích' : 'Thêm yêu thích'}
                </button>
              </div>
            </section>
          </aside>
        </div>

      {planSelectorOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-brand-lg bg-white shadow-brand-lg border border-brand-light-border overflow-hidden max-h-[90vh] flex flex-col animate-scale-up">
            <div className="flex items-start justify-between gap-4 px-7 py-6 border-b border-brand-light-border">
              <div>
                <h2 className="flex items-center gap-3 text-2xl font-bold text-slate-955">
                  <span className="text-brand-primary"><HiCalendar /></span>
                  Thêm Vào Thực Đơn
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  Chọn ngày và bữa ăn để thêm món <span className="font-bold text-slate-900">{recipe.name}</span>
                </p>
              </div>
              <button
                onClick={() => setPlanSelectorOpen(false)}
                className="btn-ghost-sm h-8 w-8 !p-0 flex items-center justify-center"
                aria-label="Đóng"
              >
                <HiX className="text-xl" />
              </button>
            </div>

            <div className="px-7 py-6 space-y-7 bg-slate-50/20 overflow-y-auto flex-1">
              <section>
                <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wider mb-3">Chọn ngày</h3>
                <div className="grid grid-cols-3 gap-2.5 mb-4">
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
                        className={`h-10 rounded-brand-sm border font-bold text-sm transition-all cursor-pointer ${
                          active
                            ? 'bg-brand-primary border-brand-primary text-white shadow-brand-glow'
                            : 'bg-white border-brand-light-border text-slate-800 hover:border-brand-primary/30 hover:bg-brand-primary/5'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[1fr_112px] gap-3">
                  <div className="relative flex-1">
                    <input
                      type="date"
                      value={selectedDate}
                      min={todayValue}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="h-12 w-full rounded-brand-sm border border-brand-light-border px-4 text-slate-900 shadow-brand-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/10"
                    />
                  </div>
                  <span className="flex h-12 items-center justify-center rounded-brand-sm bg-slate-100 px-4 text-sm text-slate-650 font-bold border border-brand-light-border">
                    {selectedDate === todayValue ? 'Hôm nay' : 'Đã chọn'}
                  </span>
                </div>
              </section>

              <section>
                <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wider mb-3">Chọn bữa ăn</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {MEAL_OPTIONS.map((meal) => {
                    const active = selectedMeal === meal.key;
                    const isDisabled = isPastMealSlot(selectedDate, meal.key);

                    return (
                      <button
                        key={meal.key}
                        type="button"
                        onClick={() => !isDisabled && setSelectedMeal(meal.key)}
                        disabled={isDisabled}
                        className={`min-h-[132px] rounded-brand-md border p-5 text-left transition-all shadow-brand-sm cursor-pointer ${
                          isDisabled
                            ? 'bg-slate-100 border-slate-200 text-slate-400 opacity-60 cursor-not-allowed'
                            : active
                            ? `${meal.selected} ring-2 ring-brand-primary`
                            : `${meal.bg} ${meal.border} hover:shadow-brand-md hover:-translate-y-0.5`
                        }`}
                      >
                        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                          <span className={`flex h-12 w-12 items-center justify-center rounded-full bg-white text-2xl shadow-brand-sm ${isDisabled ? 'text-slate-300' : meal.text}`}>
                            {isDisabled ? '🔒' : meal.icon}
                          </span>
                          <span>
                            <span className="block text-lg font-bold text-slate-900">{meal.label}</span>
                            <span className="block text-xs text-slate-400 font-medium">
                              {isDisabled ? 'Đã qua giờ ăn' : 'Chọn bữa này'}
                            </span>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-7 py-5 border-t border-brand-light-border bg-slate-50/50">
              <button
                type="button"
                onClick={() => setPlanSelectorOpen(false)}
                className="btn-ghost"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => handleAddToPlan()}
                disabled={submitting}
                className="btn-primary"
              >
                {submitting ? 'Đang thêm...' : 'Thêm vào thực đơn'}
              </button>
            </div>
          </div>
        </div>
      )}

      {allergyWarningModal && (
        <AllergyWarningModal
          recipeName={allergyWarningModal.recipeName}
          matchedAllergens={allergyWarningModal.matchedAllergens}
          onCancel={() => setAllergyWarningModal(null)}
          onConfirm={allergyWarningModal.onConfirm}
          isSubmitting={isAddingWithAllergy}
        />
      )}

      {manualAddWarningModal && (
        <MealLimitWarningModal
          servings={manualAddWarningModal.servings}
          currentDayItemsCount={manualAddWarningModal.currentCount}
          maxRecommendedItems={manualAddWarningModal.maxCount}
          recipeName={manualAddWarningModal.recipeName}
          warnings={manualAddWarningModal.warnings}
          onCancel={() => setManualAddWarningModal(null)}
          onConfirm={manualAddWarningModal.onConfirm}
        />
      )}
      </div>
    </div>
  );
}

function parseDateInput(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayInputValue(): string {
  return formatDateInput(new Date());
}

function getMonday(date: Date): string {
  const target = new Date(date);
  const day = target.getDay();
  const diff = target.getDate() - day + (day === 0 ? -6 : 1);
  target.setDate(diff);
  return formatDateInput(target);
}

function getMealPlanDay(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

function isPastMealSlot(dateStr: string, mealType: string): boolean {
  const todayDate = getTodayInputValue();
  if (dateStr < todayDate) return true;
  if (dateStr > todayDate) return false;

  const currentHour = new Date().getHours();
  if (mealType === 'breakfast') return currentHour >= 10;
  if (mealType === 'lunch') return currentHour >= 14;
  if (mealType === 'dinner') return currentHour >= 20;
  return false;
}

function getFirstAvailableMeal(dateStr: string): string {
  if (!isPastMealSlot(dateStr, 'breakfast')) return 'breakfast';
  if (!isPastMealSlot(dateStr, 'lunch')) return 'lunch';
  if (!isPastMealSlot(dateStr, 'dinner')) return 'dinner';
  return 'breakfast';
}

function getDifficultyLabel(difficulty?: string | null): string {
  if (difficulty === 'easy') return 'Dễ';
  if (difficulty === 'medium') return 'Trung bình';
  if (difficulty === 'hard') return 'Khó';
  return 'Chưa phân loại';
}

function getMealTypeLabels(mealType: unknown): string[] {
  const labels: Record<string, string> = {
    breakfast: 'sáng',
    lunch: 'trưa',
    dinner: 'tối',
  };

  if (!Array.isArray(mealType)) return [];
  return mealType
    .map((type) => labels[String(type)])
    .filter(Boolean);
}

function formatIngredientQuantity(quantity: unknown, baseServings: unknown, currentServings: number): string {
  const originalQty = Number(quantity);
  if (!Number.isFinite(originalQty) || originalQty <= 0) return '';

  const base = Number(baseServings) > 0 ? Number(baseServings) : 4;
  const scaledQty = originalQty * (currentServings / base);
  const rounded = Math.round(scaledQty * 100) / 100;

  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '');
}
