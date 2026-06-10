'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { recipesAPI } from '@/lib/api';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { HiStar, HiTrash, HiPencil, HiArrowLeft, HiOutlineChatAlt, HiX } from 'react-icons/hi';

export default function MyReviewsPage() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Edit Modal State
  const [editingReview, setEditingReview] = useState<any>(null);
  const [editRating, setEditRating] = useState<number>(5);
  const [editContent, setEditContent] = useState<string>('');
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (user) {
      fetchReviews();
    } else {
      setLoading(false);
    }
  }, [user, page]);

  const fetchReviews = async () => {
    setLoading(true);
    try {
      const res = await recipesAPI.getMyReviews({ page, limit: 10 });
      setReviews(res.data.data || []);
      const total = res.data.total || 0;
      setTotalPages(Math.ceil(total / 10) || 1);
    } catch (err) {
      console.error(err);
      toast.error('Không thể tải lịch sử đánh giá.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (review: any) => {
    setEditingReview(review);
    setEditRating(review.rating || 5);
    setEditContent(review.review || '');
  };

  const handleUpdate = async () => {
    if (!editingReview) return;
    if (editRating < 1 || editRating > 5) {
      toast.error('Điểm đánh giá phải từ 1 đến 5 sao.');
      return;
    }
    setUpdating(true);
    try {
      const recipeId = editingReview.recipe?.id;
      if (!recipeId) {
        toast.error('Dữ liệu công thức không hợp lệ.');
        return;
      }
      await recipesAPI.updateRating(recipeId, editingReview.id, {
        rating: editRating,
        review: editContent,
      });
      toast.success('Đã cập nhật đánh giá thành công!');
      setEditingReview(null);
      fetchReviews();
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Cập nhật thất bại.');
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async (review: any) => {
    if (!confirm('Bạn có chắc chắn muốn xóa đánh giá này không?')) return;
    try {
      const recipeId = review.recipe?.id;
      if (!recipeId) {
        toast.error('Dữ liệu công thức không hợp lệ.');
        return;
      }
      await recipesAPI.deleteRating(recipeId, review.id);
      toast.success('Đã xóa đánh giá thành công!');
      fetchReviews();
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Không thể xóa đánh giá.');
    }
  };

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-brand-light-bg">
        <div className="text-center space-y-4">
          <p className="text-slate-500 font-medium">Vui lòng đăng nhập để xem lịch sử đánh giá.</p>
          <Link href="/login" className="btn-primary inline-block">Đăng nhập</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-light-bg py-8">
      <div className="max-w-4xl mx-auto px-4 space-y-6">
        
        {/* Back and Title Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <Link href="/profile" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-brand-primary transition uppercase tracking-wider mb-2">
              <HiArrowLeft /> Hồ sơ cá nhân
            </Link>
            <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
              💬 Lịch Sử Đánh Giá Của Bạn
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-1">Quản lý toàn bộ đánh giá và bình luận bạn đã gửi</p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-brand-md border border-brand-light-border h-36 animate-pulse" />
            ))}
          </div>
        ) : reviews.length === 0 ? (
          <div className="card-dashboard bg-white text-center py-16 space-y-4">
            <div className="w-16 h-16 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto text-2xl">
              ✍️
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-slate-900">Chưa có đánh giá nào</h3>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                Hãy trải nghiệm các công thức nấu ăn và chia sẻ cảm nhận của bạn để giúp đỡ cộng đồng nhé!
              </p>
            </div>
            <Link href="/recipes" className="btn-primary inline-flex">Khám phá công thức</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {reviews.map((r) => (
              <div 
                key={r.id} 
                className="card-dashboard bg-white border border-brand-light-border hover:border-brand-primary/30 transition duration-300 p-5 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between"
              >
                {/* Recipe & Review Details */}
                <div className="space-y-3 flex-1">
                  <div className="flex items-center gap-3">
                    {/* Mini Image */}
                    <div className="w-12 h-12 rounded-brand-sm border border-brand-light-border overflow-hidden bg-slate-50 shrink-0">
                      {r.recipe?.imageUrl ? (
                        <img 
                          src={r.recipe.imageUrl.startsWith('http') ? r.recipe.imageUrl : `http://localhost:3001${r.recipe.imageUrl}`} 
                          alt="" 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-slate-400 font-bold bg-slate-100">🍲</div>
                      )}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm hover:text-brand-primary transition-all line-clamp-1">
                        <Link href={`/recipes/${r.recipe?.id}`}>{r.recipe?.name || 'Món ăn đã bị xóa'}</Link>
                      </h4>
                      <div className="flex items-center gap-2 mt-1">
                        {/* Rating Stars */}
                        <div className="flex">
                          {Array.from({ length: 5 }).map((_, idx) => (
                            <HiStar
                              key={idx}
                              className={`text-sm ${
                                idx < (r.rating || 0) ? 'text-amber-400' : 'text-slate-200'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-[10px] text-slate-400 font-semibold">
                          • {new Date(r.createdAt).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Review Text */}
                  <div className="pl-1 shadow-none bg-slate-50/40 border border-slate-100/50 rounded-brand-sm p-3">
                    <p className="text-slate-700 text-xs sm:text-sm font-semibold whitespace-pre-line leading-relaxed">
                      {r.review || <span className="text-slate-400 italic font-normal">Chỉ đánh giá số sao, không viết nhận xét.</span>}
                    </p>
                  </div>
                </div>

                {/* Edit & Delete Action Buttons */}
                <div className="flex gap-2 w-full md:w-auto shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 justify-end">
                  <button
                    onClick={() => handleEditClick(r)}
                    className="flex items-center gap-1 px-3 py-1.5 border border-brand-light-border hover:border-brand-primary/30 hover:bg-brand-primary/5 text-slate-655 font-bold text-xs rounded-brand-sm transition cursor-pointer"
                    title="Chỉnh sửa đánh giá"
                  >
                    <HiPencil className="text-sm" /> Chỉnh sửa
                  </button>
                  <button
                    onClick={() => handleDelete(r)}
                    className="flex items-center gap-1 px-3 py-1.5 border border-brand-danger/20 hover:border-brand-danger/40 hover:bg-red-50 text-brand-danger font-bold text-xs rounded-brand-sm transition cursor-pointer"
                    title="Xóa đánh giá"
                  >
                    <HiTrash className="text-sm" /> Xóa
                  </button>
                </div>
              </div>
            ))}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-4 select-none">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className={`px-3.5 py-1.5 rounded-brand-sm border font-bold text-xs transition-all ${
                    page === 1
                      ? 'border-slate-100 text-slate-300 cursor-not-allowed'
                      : 'border-brand-light-border bg-white text-slate-600 hover:bg-slate-50 cursor-pointer shadow-brand-sm'
                  }`}
                >
                  Trước
                </button>
                <span className="text-xs font-bold text-slate-600">
                  Trang {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className={`px-3.5 py-1.5 rounded-brand-sm border font-bold text-xs transition-all ${
                    page === totalPages
                      ? 'border-slate-100 text-slate-300 cursor-not-allowed'
                      : 'border-brand-light-border bg-white text-slate-600 hover:bg-slate-50 cursor-pointer shadow-brand-sm'
                  }`}
                >
                  Sau
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Edit Review Modal */}
      {editingReview && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-brand-lg bg-white shadow-brand-lg border border-brand-light-border overflow-hidden animate-scale-in">
            <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-brand-light-border bg-slate-50/50">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Chỉnh sửa đánh giá
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 font-medium">
                  Cập nhật cảm nhận của bạn cho món <span className="font-bold text-slate-800">{editingReview.recipe?.name}</span>
                </p>
              </div>
              <button
                onClick={() => setEditingReview(null)}
                className="p-1 hover:bg-slate-100 rounded-brand-sm text-slate-400 hover:text-slate-600 transition cursor-pointer"
                aria-label="Đóng"
              >
                <HiX className="text-xl" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Star Rating */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-bold mr-2">Đánh giá lại:</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setEditRating(star)}
                      className="p-0.5 transition hover:scale-110 cursor-pointer"
                    >
                      <HiStar
                        className={`text-2xl transition-all ${
                          star <= editRating ? 'text-amber-400' : 'text-slate-300 hover:text-amber-200'
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <span className="text-xs text-amber-600 font-bold ml-2">
                  {editRating === 5 ? 'Tuyệt vời!' : editRating === 4 ? 'Rất ngon' : editRating === 3 ? 'Bình thường' : editRating === 2 ? 'Tạm ổn' : 'Không thích'}
                </span>
              </div>

              {/* Input Content */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nội dung nhận xét</label>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="Chia sẻ cảm nhận chi tiết của bạn..."
                  rows={4}
                  className="w-full text-sm rounded-brand-sm border border-brand-light-border p-3 shadow-brand-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/10 bg-white"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-brand-light-border bg-slate-50/50">
              <button
                onClick={() => setEditingReview(null)}
                className="px-4 py-2 border border-brand-light-border rounded-brand-sm hover:bg-slate-100 transition font-bold text-xs text-slate-650 cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleUpdate}
                disabled={updating}
                className="btn-primary text-xs"
              >
                {updating ? 'Đang lưu...' : 'Lưu Thay Đổi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
