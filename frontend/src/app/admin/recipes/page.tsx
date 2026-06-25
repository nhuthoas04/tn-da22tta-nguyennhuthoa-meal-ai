'use client';
import { useEffect, useState } from 'react';
import { adminAPI, recipesAPI } from '@/lib/api';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useSearchParams } from 'next/navigation';
import {
  HiPlus, HiPencil, HiTrash, HiSearch, HiClock, HiFire, HiEye, HiX, HiUser,
} from 'react-icons/hi';

const getFallbackApiBase = () => {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') {
      return 'https://tn-da22tta-nguyennhuthoa-meal-ai-backend.onrender.com';
    }
  }
  return 'http://localhost:3001';
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || getFallbackApiBase();

export default function AdminRecipesPage() {
  const searchParams = useSearchParams();
  const [recipes, setRecipes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [viewRecipe, setViewRecipe] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const statusParam = searchParams.get('status') || '';
    setStatusFilter(statusParam);
    setPage(1);
  }, [searchParams]);

  useEffect(() => {
    loadRecipes();
  }, [page, statusFilter]);

  const loadRecipes = async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 12 };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const res = await adminAPI.getAllRecipes(params);
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

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Bạn có chắc muốn xóa "${name}"?`)) return;
    try {
      await adminAPI.deleteRecipe(id);
      toast.success('Đã xóa công thức');
      loadRecipes();
    } catch (err) {
      toast.error('Lỗi khi xóa');
    }
  };

  const handleView = async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await recipesAPI.getById(id);
      setViewRecipe(res.data);
    } catch (err) {
      toast.error('Không thể tải chi tiết');
    } finally {
      setDetailLoading(false);
    }
  };

  const statusOptions = [
    { value: '', label: 'Tất cả' },
    { value: 'approved', label: 'Đã duyệt' },
    { value: 'pending', label: 'Chờ duyệt' },
    { value: 'rejected', label: 'Đã từ chối' },
  ];

  const statusBadge = (status: string) => {
    const styles: any = {
      approved: 'bg-emerald-100 text-emerald-700',
      pending: 'bg-amber-100 text-amber-700',
      rejected: 'bg-red-100 text-red-700',
    };
    const labels: any = {
      approved: 'Đã duyệt',
      pending: 'Chờ duyệt',
      rejected: 'Từ chối',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
        {labels[status] || status}
      </span>
    );
  };

  const getImgUrl = (url: string) => url ? (url.startsWith('http') ? url : `${API_BASE}${url}`) : '';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý công thức</h1>
          <p className="text-gray-500 mt-1">Tạo, sửa, xóa công thức trong hệ thống</p>
        </div>
        <Link
          href="/admin/recipes/create"
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors w-full sm:w-auto text-sm shrink-0"
        >
          <HiPlus className="text-lg" />
          Tạo mới
        </Link>
      </div>

      {/* Search & Filter */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <HiSearch className="absolute left-3 top-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Tìm công thức..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm"
            />
          </div>
          <button type="submit" className="px-6 py-2.5 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition w-full sm:w-auto text-sm">
            Tìm
          </button>
        </form>
        <div className="flex flex-wrap gap-2 mt-3">
          {statusOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setStatusFilter(opt.value); setPage(1); }}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition ${
                statusFilter === opt.value
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Recipe List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-white rounded-xl border border-gray-200 animate-pulse" />
          ))}
        </div>
      ) : recipes.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
          <p className="text-4xl mb-3">📭</p>
          <p className="text-gray-500">Không có công thức nào</p>
        </div>
      ) : (
        <div className="space-y-3">
          {recipes.map((recipe) => (
            <div
              key={recipe.id}
              className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center gap-4 min-w-0">
                {/* Thumbnail */}
                {recipe.imageUrl ? (
                  <img
                    src={getImgUrl(recipe.imageUrl)}
                    alt={recipe.name}
                    className="w-16 h-16 rounded-xl object-cover shrink-0 border border-gray-100"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 text-2xl">
                    🍽️
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-semibold text-gray-900 truncate text-sm">{recipe.name}</h3>
                    {statusBadge(recipe.status)}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                    <span className="flex items-center gap-1"><HiClock /> {recipe.cookingTime}p</span>
                    <span className="flex items-center gap-1"><HiFire /> {recipe.calories} kcal</span>
                    {recipe.cuisineRegion && <span>{recipe.cuisineRegion}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-1 w-full sm:w-auto border-t sm:border-t-0 pt-2 sm:pt-0">
                <button
                  onClick={() => handleView(recipe.id)}
                  className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors flex-1 sm:flex-initial flex justify-center"
                  title="Xem chi tiết"
                >
                  <HiEye className="text-lg" />
                </button>
                <Link
                  href={`/admin/recipes/${recipe.id}/edit`}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex-1 sm:flex-initial flex justify-center"
                  title="Sửa"
                >
                  <HiPencil className="text-lg" />
                </Link>
                <button
                  onClick={() => handleDelete(recipe.id, recipe.name)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-1 sm:flex-initial flex justify-center"
                  title="Xóa"
                >
                  <HiTrash className="text-lg" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-10 h-10 rounded-xl font-medium transition ${
                page === p
                  ? 'bg-purple-600 text-white'
                  : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {(viewRecipe || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setViewRecipe(null)}>
          <div
            className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-xl animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading ? (
              <div className="p-12 flex justify-center">
                <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : viewRecipe && (
              <>
                {/* Image */}
                {viewRecipe.imageUrl && (
                  <img
                    src={getImgUrl(viewRecipe.imageUrl)}
                    alt={viewRecipe.name}
                    className="w-full h-40 sm:h-56 object-cover rounded-t-2xl shrink-0"
                  />
                )}

                <div className="p-5 sm:p-6 space-y-4 flex-1 overflow-y-auto">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-gray-900">{viewRecipe.name}</h2>
                        {statusBadge(viewRecipe.status)}
                      </div>
                      {viewRecipe.description && (
                        <p className="text-gray-500 mt-1 text-sm">{viewRecipe.description}</p>
                      )}
                    </div>
                    <button onClick={() => setViewRecipe(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                      <HiX className="text-xl text-gray-500" />
                    </button>
                  </div>

                  {/* Rejection reason */}
                  {viewRecipe.status === 'rejected' && viewRecipe.rejectionReason && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                      <strong>Lý do từ chối:</strong> {viewRecipe.rejectionReason}
                    </div>
                  )}

                  {/* Submitter */}
                  {viewRecipe.submitterName && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <HiUser className="text-purple-500" />
                      Người đăng: <span className="font-medium text-gray-700">{viewRecipe.submitterName}</span>
                    </div>
                  )}

                  {/* Quick stats */}
                  <div className="grid grid-cols-4 gap-3">
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500">Thời gian</p>
                      <p className="font-bold text-gray-900">{viewRecipe.cookingTime}p</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500">Calories</p>
                      <p className="font-bold text-gray-900">{viewRecipe.calories}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500">Khẩu phần</p>
                      <p className="font-bold text-gray-900">{viewRecipe.servings || '-'}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500">Độ khó</p>
                      <p className="font-bold text-gray-900 capitalize">
                        {viewRecipe.difficulty === 'easy' ? 'Dễ' : viewRecipe.difficulty === 'medium' ? 'TB' : 'Khó'}
                      </p>
                    </div>
                  </div>

                  {/* Ingredients */}
                  {viewRecipe.ingredients?.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2">Nguyên liệu</h3>
                      <div className="flex flex-wrap gap-2">
                        {viewRecipe.ingredients.map((ing: any, i: number) => (
                          <span key={i} className="px-3 py-1 bg-purple-50 text-purple-700 rounded-lg text-sm">
                            {ing.name} ({ing.quantity} {ing.unit})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Steps */}
                  {viewRecipe.steps?.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2">Cách làm</h3>
                      <div className="space-y-2">
                        {viewRecipe.steps.map((s: any, i: number) => (
                          <div key={i} className="flex gap-3 items-start">
                            <span className="w-7 h-7 bg-purple-100 text-purple-700 rounded-lg flex items-center justify-center font-bold text-xs shrink-0">{s.step}</span>
                            <p className="text-sm text-gray-600">{s.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                    <Link
                      href={`/admin/recipes/${viewRecipe.id}/edit`}
                      className="px-4 py-2 bg-blue-50 text-blue-700 rounded-xl text-sm font-medium hover:bg-blue-100 transition"
                    >
                      Chỉnh sửa
                    </Link>
                    <button
                      onClick={() => setViewRecipe(null)}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition"
                    >
                      Đóng
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
