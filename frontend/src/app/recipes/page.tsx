'use client';
import { useEffect, useState } from 'react';
import { recipesAPI } from '@/lib/api';
import Link from 'next/link';
import { HiSearch, HiClock, HiFire, HiAdjustments } from 'react-icons/hi';

const formatCount = (value: unknown) => {
  const count = Number(value) || 0;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(count >= 10_000_000 ? 0 : 1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(count >= 10_000 ? 0 : 1)}K`;
  return String(count);
};

const formatRating = (value: unknown) => {
  const rating = Number(value) || 0;
  return rating.toFixed(1);
};

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [mealType, setMealType] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [maxCookingTime, setMaxCookingTime] = useState('');

  useEffect(() => {
    loadRecipes();
  }, [page, mealType]);

  const loadRecipes = async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 12 };
      if (search) params.search = search;
      if (mealType) params.mealType = mealType;
      if (maxCookingTime) params.maxCookingTime = maxCookingTime;
      const res = await recipesAPI.getAll(params);
      setRecipes(res.data.data || []);
      setTotalPages(res.data.meta?.totalPages || 1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadRecipes();
  };

  const mealTypes = [
    { value: '', label: 'Tất cả' },
    { value: 'breakfast', label: 'Bữa sáng' },
    { value: 'lunch', label: 'Bữa trưa' },
    { value: 'dinner', label: 'Bữa tối' },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-4 py-6 bg-brand-light-bg min-h-screen">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Công thức nấu ăn 🍳</h1>
        <p className="text-sm text-slate-500 mt-1">Khám phá các món ăn Việt Nam truyền thống và bổ dưỡng</p>
      </div>

      {/* Search & Filters */}
      <div className="glass-light border-brand-primary/20 shadow-brand-glow p-5 rounded-brand-lg">
        <form onSubmit={handleSearch} className="flex gap-3">
          <div className="relative flex-1">
            <HiSearch className="absolute left-3 top-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm công thức..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-brand-light-border rounded-brand-sm focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none transition text-sm shadow-brand-sm"
            />
          </div>
          <button type="submit" className="btn-primary">
            Tìm kiếm
          </button>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="flex h-10 w-10 items-center justify-center border border-brand-light-border rounded-brand-sm hover:bg-slate-50 transition-all cursor-pointer"
          >
            <HiAdjustments className="text-xl text-slate-650" />
          </button>
        </form>

        {/* Filters */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-brand-light-border flex flex-wrap gap-6 animate-fade-in">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Bữa ăn</label>
              <div className="flex gap-2">
                {mealTypes.map((mt) => (
                  <button
                    key={mt.value}
                    onClick={() => { setMealType(mt.value); setPage(1); }}
                    className={`px-3 py-1.5 rounded-brand-sm text-sm font-bold transition-all cursor-pointer ${
                      mealType === mt.value
                        ? 'bg-brand-primary/10 text-brand-primary border border-brand-primary/20'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-transparent'
                    }`}
                  >
                    {mt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Thời gian nấu tối đa</label>
              <input
                type="number"
                value={maxCookingTime}
                onChange={(e) => setMaxCookingTime(e.target.value)}
                placeholder="VD: 30"
                className="w-28 px-3 py-1.5 border border-brand-light-border rounded-brand-sm text-sm focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Recipe Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="bg-white rounded-brand-md border border-brand-light-border h-72 shadow-brand-sm" />
          ))}
        </div>
      ) : recipes.length === 0 ? (
        <div className="card-dashboard p-16 text-center">
          <p className="text-5xl mb-4 animate-brand-float">🍲</p>
          <p className="text-slate-500 font-medium">Không tìm thấy công thức nào phù hợp</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {recipes.map((recipe: any) => (
            <Link
              key={recipe.id}
              href={`/recipes/${recipe.id}`}
              className="card-recipe flex flex-col group"
            >
              <div className="h-44 bg-gradient-to-br from-brand-primary/10 to-brand-secondary/10 flex items-center justify-center relative select-none">
                <span className="text-5xl group-hover:scale-110 transition-transform duration-350">🍲</span>
                {recipe.difficulty && (
                  <span className={`absolute top-3 right-3 px-2.5 py-0.5 rounded-brand-sm text-[10px] font-bold uppercase tracking-wider border ${
                    recipe.difficulty === 'easy' ? 'bg-brand-success/10 text-brand-success border-brand-success/20' :
                    recipe.difficulty === 'medium' ? 'bg-brand-warning/10 text-brand-warning border-brand-warning/20' :
                    'bg-brand-danger/10 text-brand-danger border-brand-danger/20'
                  }`}>
                    {recipe.difficulty === 'easy' ? 'Dễ' : recipe.difficulty === 'medium' ? 'T.Bình' : 'Khó'}
                  </span>
                )}
              </div>
              <div className="p-4 flex-1 flex flex-col justify-between bg-white">
                <div>
                  <h3 className="font-bold text-slate-800 group-hover:text-brand-primary transition-all line-clamp-1 text-sm">
                    {recipe.name}
                  </h3>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-500">
                    <span>
                      {(Number(recipe.reviewCount) || 0) > 0
                        ? `⭐ ${formatRating(recipe.averageRating)} (${formatCount(recipe.reviewCount)})`
                        : '⭐ Chưa có đánh giá'}
                    </span>
                    <span>❤️ {formatCount(recipe.favoriteCount)}</span>
                    <span>👁️ {formatCount(recipe.viewCount)}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">{recipe.description}</p>
                </div>
                <div className="mt-3">
                  <div className="flex items-center gap-4 text-xs font-semibold text-slate-400">
                    <span className="flex items-center gap-1"><HiClock className="text-brand-primary" /> {recipe.cookingTime} phút</span>
                    <span className="flex items-center gap-1"><HiFire className="text-brand-primary" /> {recipe.calories} kcal</span>
                  </div>
                  {recipe.cuisineRegion && (
                    <span className="inline-block mt-2.5 px-2 py-0.5 bg-brand-primary/10 text-brand-primary border border-brand-primary/20 rounded-brand-sm text-[10px] font-bold uppercase tracking-wider">
                      {recipe.cuisineRegion}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-8">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-10 h-10 rounded-brand-sm font-bold transition-all cursor-pointer ${
                page === p
                  ? 'bg-brand-primary text-white border border-transparent shadow-brand-glow'
                  : 'bg-white border border-brand-light-border text-slate-650 hover:bg-slate-100'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
