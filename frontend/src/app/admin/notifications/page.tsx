'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiExclamation,
  HiOutlineChatAlt2,
  HiStar,
  HiTrash,
  HiX,
} from 'react-icons/hi';
import { adminModerationAPI } from '@/lib/api';

export default function AdminNotificationsPage() {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadFlaggedReviews = async () => {
    setLoading(true);
    try {
      const response = await adminModerationAPI.getFlaggedReviews();
      setReviews(response.data.data || []);
    } catch (error) {
      console.error(error);
      toast.error('Không thể tải danh sách cảnh báo đánh giá.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFlaggedReviews();
  }, []);

  const removeFromList = (reviewId: string) => {
    setReviews((current) => current.filter((review) => review.id !== reviewId));
    window.dispatchEvent(new Event('update-notifications-count'));
  };

  const handleIgnore = async (reviewId: string) => {
    setProcessingId(reviewId);
    try {
      await adminModerationAPI.ignoreFlaggedReview(reviewId);
      removeFromList(reviewId);
      toast.success('Đã bỏ qua cảnh báo. Nội dung vẫn được che.');
    } catch (error) {
      console.error(error);
      toast.error('Không thể bỏ qua cảnh báo.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (reviewId: string) => {
    if (!window.confirm('Xóa vĩnh viễn đánh giá hoặc bình luận này?')) return;

    setProcessingId(reviewId);
    try {
      await adminModerationAPI.deleteFlaggedReview(reviewId);
      removeFromList(reviewId);
      toast.success('Đã xóa nội dung vi phạm.');
    } catch (error) {
      console.error(error);
      toast.error('Không thể xóa nội dung vi phạm.');
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-72 rounded bg-slate-200" />
        {[1, 2, 3].map((item) => (
          <div key={item} className="h-44 rounded-lg border border-slate-200 bg-white" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <HiExclamation className="text-amber-500" />
            Cảnh báo nội dung đánh giá
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Kiểm tra đánh giá và phản hồi chứa từ ngữ không phù hợp.
          </p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800">
          {reviews.length} cảnh báo chưa xử lý
        </div>
      </header>

      {reviews.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white px-6 py-14 text-center">
          <HiOutlineChatAlt2 className="mx-auto text-4xl text-emerald-500" />
          <p className="mt-3 font-semibold text-slate-800">Không có nội dung cần xem xét</p>
          <p className="mt-1 text-sm text-slate-500">Các đánh giá thông thường đã được hiển thị tự động.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => {
            const busy = processingId === review.id;
            const words = String(review.flaggedWords || '')
              .split(',')
              .map((word) => word.trim())
              .filter(Boolean);

            return (
              <article key={review.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1 space-y-4">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                      <span className="font-semibold text-slate-900">
                        {review.user?.fullName || 'Người dùng đã bị xóa'}
                      </span>
                      <span className="text-slate-500">{review.user?.email}</span>
                      <span className="text-slate-400">
                        {new Date(review.createdAt).toLocaleString('vi-VN')}
                      </span>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase text-slate-400">Công thức</p>
                        <p className="mt-1 font-semibold text-slate-800">
                          {review.recipe?.name || 'Công thức đã bị xóa'}
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase text-slate-400">Đánh giá</p>
                        <div className="mt-1 flex items-center gap-1 text-amber-400">
                          {review.rating ? (
                            Array.from({ length: 5 }).map((_, index) => (
                              <HiStar
                                key={index}
                                className={index < review.rating ? 'text-amber-400' : 'text-slate-200'}
                              />
                            ))
                          ) : (
                            <span className="text-sm text-slate-600">Phản hồi bình luận</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm">
                      <p>
                        <span className="font-semibold text-slate-600">Nội dung công khai: </span>
                        <span className="text-slate-800">{review.review}</span>
                      </p>
                      <p>
                        <span className="font-semibold text-slate-600">Nội dung gốc: </span>
                        <span className="text-red-700">{review.originalReview}</span>
                      </p>
                      <p>
                        <span className="font-semibold text-slate-600">Lý do: </span>
                        <span className="text-slate-800">{review.flaggedReason}</span>
                      </p>
                    </div>

                    {words.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-slate-500">Từ vi phạm:</span>
                        {words.map((word) => (
                          <span key={word} className="rounded bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                            {word}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleIgnore(review.id)}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <HiX />
                      Bỏ qua
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleDelete(review.id)}
                      className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      <HiTrash />
                      Xóa
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
