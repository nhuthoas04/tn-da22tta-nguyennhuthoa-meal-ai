'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { recipesAPI, mealPlanAPI } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';
import { HiClock, HiFire, HiHeart, HiUsers, HiArrowLeft, HiCalendar, HiX, HiStar } from 'react-icons/hi';
import Link from 'next/link';

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
  {
    key: 'snack',
    label: 'Phụ',
    icon: '🍴',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    text: 'text-purple-600',
    selected: 'ring-purple-300 border-purple-400 bg-purple-50',
  },
];

const formatCount = (value: unknown) => {
  const count = Number(value) || 0;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(count >= 10_000_000 ? 0 : 1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(count >= 10_000 ? 0 : 1)}K`;
  return String(count);
};

export default function RecipeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [recipe, setRecipe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isFav, setIsFav] = useState(false);
  const [servings, setServings] = useState<number>(4);

  const [planSelectorOpen, setPlanSelectorOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => formatDateInput(new Date()));
  const [selectedMeal, setSelectedMeal] = useState('breakfast');
  const [submitting, setSubmitting] = useState(false);

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
      setRecipe(res.data);
      setIsFav(Boolean(res.data.isFavorite ?? res.data.isFavorited));
      const profileServings = (user as any)?.preferences?.servings;
      setServings(profileServings || res.data.servings || 4);
      
      // Save recipe to recently viewed list
      saveToRecentlyViewed(res.data);
    } catch {
      toast.error('Không tìm thấy công thức');
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
  }, [params.id]);

  const handleRatingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('Vui lòng đăng nhập để gửi đánh giá');
      return;
    }
    setSubmittingRating(true);
    try {
      await recipesAPI.createRating(recipe.id, {
        rating: userRating,
        review: userReview,
      });
      toast.success('Đã gửi đánh giá thành công!');
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
    setEditingText(r.review);
  };

  const handleUpdateRating = async (ratingId: string) => {
    try {
      await recipesAPI.updateRating(recipe.id, ratingId, {
        rating: editingScore,
        review: editingText,
      });
      toast.success('Đã cập nhật đánh giá thành công!');
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
    try {
      const res = await recipesAPI.toggleFavorite(recipe.id);
      const nextIsFavorite = Boolean(res.data.isFavorite ?? res.data.isFavorited);
      setIsFav(nextIsFavorite);
      setRecipe((prev: any) => prev ? {
        ...prev,
        isFavorite: nextIsFavorite,
        isFavorited: nextIsFavorite,
        favoriteCount: res.data.favoriteCount ?? prev.favoriteCount ?? 0,
      } : prev);
      toast.success(res.data.message);
    } catch {
      toast.error('Có lỗi xảy ra');
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
      await recipesAPI.createReply(recipe.id, parentId, { review: replyText });
      toast.success('Đã gửi phản hồi thành công!');
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
    if (selectedDate < getTodayInputValue()) {
      setSelectedDate(getTodayInputValue());
    }
    setPlanSelectorOpen(true);
  };

  const handleAddToPlan = async () => {
    if (!user) {
      toast.error('Vui lòng đăng nhập để thực hiện');
      return;
    }
    if (selectedDate < getTodayInputValue()) {
      toast.error('Không thể thêm món vào ngày đã qua');
      setSelectedDate(getTodayInputValue());
      return;
    }

    const targetWeekStart = getMonday(parseDateInput(selectedDate));
    const targetDayOfWeek = getMealPlanDay(parseDateInput(selectedDate));

    setSubmitting(true);
    try {
      await mealPlanAPI.setMealSlot({
        weekStart: targetWeekStart,
        dayOfWeek: targetDayOfWeek,
        mealType: selectedMeal,
        recipeId: recipe.id,
      });
      toast.success(`Đã thêm "${recipe.name}" vào thực đơn thành công!`);
      setPlanSelectorOpen(false);
      const params = new URLSearchParams({
        weekStart: targetWeekStart,
        day: String(targetDayOfWeek),
        meal: selectedMeal,
      });
      router.push(`/meal-planner?${params.toString()}`);
    } catch (err) {
      console.error(err);
      toast.error('Không thể thêm món ăn vào thực đơn');
    } finally {
      setSubmitting(false);
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

  return (
    <div className="max-w-4xl mx-auto space-y-6 px-4 py-6 bg-brand-light-bg min-h-screen">
      <Link href="/recipes" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-primary font-semibold transition-all">
        <HiArrowLeft /> Trở lại danh sách
      </Link>

      <div className="bg-white border border-brand-light-border rounded-brand-lg overflow-hidden shadow-brand-md transition-all duration-300">
        <div className="h-64 bg-slate-100 relative overflow-hidden select-none">
          {recipe.imageUrl ? (
            <img
              src={recipe.imageUrl.startsWith('http') ? recipe.imageUrl : `http://localhost:3001${recipe.imageUrl}`}
              alt={recipe.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-r from-brand-emerald to-brand-teal flex items-center justify-center">
              <span className="text-8xl animate-brand-float">🍳</span>
            </div>
          )}
        </div>
        <div className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{recipe.name}</h1>
              <p className="text-sm text-slate-500 mt-1">{recipe.description}</p>
              {recipe.totalRatings > 0 ? (
                <div className="flex items-center gap-1 mt-2 text-sm text-amber-500 font-semibold bg-amber-50/50 border border-amber-200/50 px-2.5 py-1 rounded-brand-sm w-fit animate-fade-in">
                  <div className="flex items-center">
                    {Array.from({ length: 5 }).map((_, idx) => (
                      <HiStar
                        key={idx}
                        className={idx < Math.round(Number(recipe.averageRating) || 0) ? 'text-amber-400 text-base' : 'text-slate-200 text-base'}
                      />
                    ))}
                  </div>
                  <span className="text-slate-700 ml-1">
                    {Number(recipe.averageRating || 0).toFixed(1)} ({recipe.totalRatings} đánh giá)
                  </span>
                </div>
              ) : (
                <p className="text-xs text-slate-400 mt-2 font-medium">Chưa có đánh giá nào</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={openPlanSelector}
                className="btn-primary"
              >
                <HiCalendar className="text-base" />
                Thêm vào thực đơn
              </button>
              <button
                onClick={toggleFav}
                className={`inline-flex items-center gap-1.5 px-3 py-3 rounded-brand-sm border transition-all cursor-pointer ${
                  isFav ? 'bg-red-50 border-brand-danger/30 text-brand-danger shadow-brand-sm' : 'bg-slate-50 border-brand-light-border text-slate-400 hover:text-brand-danger'
                }`}
                aria-label="Yêu thích"
                title="Lưu công thức"
              >
                <HiHeart className="text-xl" />
                <span className="text-sm font-bold">{formatCount(recipe.favoriteCount)}</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 mt-4">
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-brand-sm text-sm border border-brand-light-border text-slate-650 font-semibold shadow-brand-sm">
              <HiClock className="text-brand-primary" /> {recipe.cookingTime} phút
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-brand-sm text-sm border border-brand-light-border text-slate-650 font-semibold shadow-brand-sm">
              <HiFire className="text-brand-warning" /> {recipe.calories} kcal
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-brand-sm text-sm border border-brand-light-border text-slate-650 shadow-brand-sm">
              <HiUsers className="text-brand-secondary animate-pulse" />
              <span className="font-bold">Khẩu phần:</span>
              <button 
                type="button"
                onClick={() => setServings(prev => Math.max(1, prev - 1))}
                className="w-6 h-6 flex items-center justify-center bg-white hover:bg-slate-100 border border-brand-light-border rounded-brand-sm font-bold text-xs transition cursor-pointer"
              >
                -
              </button>
              <span className="font-bold text-slate-800 w-4 text-center">{servings}</span>
              <button 
                type="button"
                onClick={() => setServings(prev => Math.min(20, prev + 1))}
                className="w-6 h-6 flex items-center justify-center bg-white hover:bg-slate-100 border border-brand-light-border rounded-brand-sm font-bold text-xs transition cursor-pointer"
              >
                +
              </button>
              <span className="text-xs text-slate-400 font-medium">người</span>
            </div>
            {recipe.cuisineRegion && (
              <span className="px-3 py-2 bg-brand-primary/10 text-brand-primary border border-brand-primary/20 rounded-brand-sm text-sm font-bold shadow-brand-sm">
                📍 {recipe.cuisineRegion}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card-dashboard bg-white">
          <h2 className="font-bold text-slate-900 text-base mb-4">Dinh dưỡng</h2>
          <div className="space-y-3">
            {[
              { label: 'Calories', value: `${recipe.calories || 0} kcal`, color: 'bg-brand-warning', pct: Math.min(100, ((Number(recipe.calories) || 0) / 800) * 100) },
              { label: 'Protein', value: `${recipe.protein || 0}g`, color: 'bg-brand-secondary', pct: Math.min(100, ((Number(recipe.protein) || 0) / 50) * 100) },
              { label: 'Carbs', value: `${recipe.carbs || 0}g`, color: 'bg-amber-500', pct: Math.min(100, ((Number(recipe.carbs) || 0) / 100) * 100) },
              { label: 'Fat', value: `${recipe.fat || 0}g`, color: 'bg-brand-danger', pct: Math.min(100, ((Number(recipe.fat) || 0) / 40) * 100) },
            ].map((n) => (
              <div key={n.label}>
                <div className="flex justify-between text-sm mb-1 font-medium text-slate-655">
                  <span>{n.label}</span>
                  <span className="font-bold text-slate-850">{n.value}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className={`${n.color} h-2 rounded-full transition-all`} style={{ width: `${n.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card-dashboard bg-white">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-slate-900 text-base">Nguyên liệu</h2>
            <span className="text-xs font-bold text-brand-primary bg-brand-primary/10 border border-brand-primary/20 px-2.5 py-1 rounded-brand-sm">
              Quy đổi cho {servings} người
            </span>
          </div>
          <ul className="space-y-2 divide-y divide-slate-100">
            {(Array.isArray(recipe.ingredients) ? recipe.ingredients : []).map((ing: any, i: number) => {
              const baseServings = Number(recipe.servings) || 4;
              const scale = servings / (baseServings > 0 ? baseServings : 4);
              const originalQty = Number(ing.quantity);
              
              let displayQty = '';
              if (!isNaN(originalQty) && originalQty > 0) {
                const scaledQty = originalQty * scale;
                displayQty = String(Math.round(scaledQty * 100) / 100);
              }

              return (
                <li key={i} className="flex justify-between items-center text-sm py-2 border-b border-brand-light-border last:border-0 font-medium">
                  <span className="text-slate-700">{ing.name}</span>
                  <span className="text-slate-500 font-bold">
                    {displayQty} {ing.unit}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="card-dashboard bg-white lg:col-span-1">
          <h2 className="font-bold text-slate-900 text-base mb-4">Cách nấu</h2>
          <ol className="space-y-3">
            {(Array.isArray(recipe.steps) ? recipe.steps : []).map((step: any, i: number) => (
              <li key={i} className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-brand-primary/10 text-brand-primary rounded-full text-xs font-bold flex items-center justify-center">
                  {step.step}
                </span>
                <p className="text-sm text-slate-700 leading-relaxed font-medium">{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Đánh giá & Bình luận */}
      <div className="card-dashboard bg-white space-y-6">
        <div className="flex items-center justify-between border-b border-brand-light-border pb-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            ⭐ Đánh Giá & Bình Luận ({totalRatings})
          </h2>
          {Number(recipe.averageRating) > 0 && (
            <div className="flex items-center gap-1 text-amber-500 font-bold text-lg">
              <span>{Number(recipe.averageRating || 0).toFixed(1)} / 5</span>
              <HiStar className="text-amber-450" />
            </div>
          )}
        </div>

        {/* Form viết đánh giá */}
        {user ? (
          <form onSubmit={handleRatingSubmit} className="space-y-4 bg-slate-50 border border-brand-light-border rounded-brand-md p-4">
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
          <div className="text-center py-6 bg-slate-50 border border-dashed border-brand-light-border rounded-brand-md">
            <p className="text-sm text-slate-500">Vui lòng đăng nhập để đánh giá món ăn này.</p>
          </div>
        )}

        <div className="space-y-4 divide-y divide-brand-light-border">
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
                          {r.moderationStatus === 'pending' && (
                            <span className="px-1.5 py-0.5 rounded-brand-sm text-[9px] bg-brand-warning/10 text-brand-warning font-bold border border-brand-warning/20 animate-pulse">
                              Đang chờ duyệt
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
      </div>

      {planSelectorOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-brand-lg bg-white shadow-brand-lg border border-brand-light-border overflow-hidden">
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

            <div className="px-7 py-6 space-y-7 bg-slate-50/20">
              <section>
                <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wider mb-3">Chọn ngày</h3>
                <div className="flex flex-wrap gap-2.5 mb-4">
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
                        className={`px-4 py-2 rounded-brand-sm border font-bold text-sm transition-all cursor-pointer ${
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

                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="relative flex-1">
                    <input
                      type="date"
                      value={selectedDate}
                      min={todayValue}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-full rounded-brand-sm border border-brand-light-border px-4 py-3 text-slate-900 shadow-brand-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/10"
                    />
                  </div>
                  {selectedDate === todayValue && (
                    <span className="self-start sm:self-auto rounded-brand-sm bg-slate-100 px-4 py-3 text-sm text-slate-650 font-bold border border-brand-light-border">
                      Hôm nay
                    </span>
                  )}
                </div>
              </section>

              <section>
                <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wider mb-3">Chọn bữa ăn</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {MEAL_OPTIONS.map((meal) => {
                    const active = selectedMeal === meal.key;

                    return (
                      <button
                        key={meal.key}
                        type="button"
                        onClick={() => setSelectedMeal(meal.key)}
                        className={`min-h-[128px] rounded-brand-md border p-5 text-left transition-all shadow-brand-sm cursor-pointer ${
                          active
                            ? `${meal.selected} ring-2 ring-brand-primary`
                            : `${meal.bg} ${meal.border} hover:shadow-brand-md hover:-translate-y-0.5`
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <span className={`flex h-12 w-12 items-center justify-center rounded-full bg-white text-2xl shadow-brand-sm ${meal.text}`}>
                            {meal.icon}
                          </span>
                          <span>
                            <span className="block text-lg font-bold text-slate-900">{meal.label}</span>
                            <span className="block text-xs text-slate-400 font-medium">Chọn bữa này</span>
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
                onClick={handleAddToPlan}
                disabled={submitting}
                className="btn-primary"
              >
                {submitting ? 'Đang thêm...' : 'Thêm vào thực đơn'}
              </button>
            </div>
          </div>
        </div>
      )}
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
