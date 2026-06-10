'use client';
import { useEffect, useState } from 'react';
import { adminModerationAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  HiBell, HiCheck, HiTrash, HiUserCircle, HiExclamation,
  HiEye, HiCheckCircle, HiLockOpen
} from 'react-icons/hi';

export default function AdminNotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const res = await adminModerationAPI.getNotifications();
      setNotifications(res.data.data || []);
      setUnreadCount(res.data.unreadCount || 0);
      // Trigger Navbar count sync
      window.dispatchEvent(new Event('update-notifications-count'));
    } catch (err) {
      console.error(err);
      toast.error('Không thể tải danh sách cảnh báo.');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      await adminModerationAPI.markNotificationAsRead(id);
      toast.success('Đã đánh dấu đã đọc');
      loadNotifications();
    } catch (err) {
      console.error(err);
      toast.error('Có lỗi xảy ra');
    }
  };

  const handleApproveReview = async (reviewId: string) => {
    try {
      await adminModerationAPI.approveReview(reviewId);
      toast.success('Đã duyệt bình luận (bỏ qua cảnh báo)');
      loadNotifications();
    } catch (err) {
      console.error(err);
      toast.error('Không thể duyệt bình luận');
    }
  };

  const handleRejectReview = async (reviewId: string) => {
    if (!confirm('Bạn có chắc chắn muốn gỡ bỏ bình luận này khỏi hệ thống?')) return;
    try {
      await adminModerationAPI.rejectReview(reviewId);
      toast.success('Đã gỡ bỏ bình luận vi phạm');
      loadNotifications();
    } catch (err) {
      console.error(err);
      toast.error('Không thể gỡ bình luận');
    }
  };

  const handleUnlockUser = async (userId: string) => {
    if (!confirm('Đặt lại số lần vi phạm và mở khóa quyền bình luận cho người dùng này?')) return;
    try {
      await adminModerationAPI.unlockUser(userId);
      toast.success('Đã mở khóa tài khoản thành công!');
      loadNotifications();
    } catch (err) {
      console.error(err);
      toast.error('Không thể mở khóa tài khoản');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 w-48 bg-gray-200 rounded-lg" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-white rounded-2xl border border-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <HiBell className="text-purple-600" />
          Thông báo vi phạm & Kiểm duyệt
        </h1>
        <p className="text-gray-500 mt-1">Kiểm soát và xử lý các nội dung vi phạm chính sách của MealAI</p>
      </div>

      {/* Stats */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm max-w-sm flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Cảnh báo chưa đọc</p>
          <p className="text-3xl font-extrabold text-red-500 mt-1">{unreadCount}</p>
        </div>
        <div className="p-3.5 bg-red-50 rounded-2xl text-red-500">
          <HiExclamation className="text-3xl animate-bounce" />
        </div>
      </div>

      {/* Notification List */}
      <div className="space-y-4">
        {notifications.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <p className="text-5xl mb-3">🛡️</p>
            <p className="text-gray-500 font-semibold">Tất cả đều sạch! Chưa phát hiện vi phạm nào.</p>
          </div>
        ) : (
          notifications.map((notif: any) => {
            const hasUser = !!notif.user;
            const hasReview = !!notif.review;
            const isLocked = hasUser && notif.user.commentLockedUntil && new Date(notif.user.commentLockedUntil) > new Date();

            return (
              <div
                key={notif.id}
                className={`bg-white rounded-2xl border transition hover:shadow-md p-5 flex flex-col md:flex-row gap-4 items-start justify-between ${
                  !notif.isRead ? 'border-red-200 bg-red-50/10 ring-2 ring-red-50' : 'border-gray-200'
                }`}
              >
                {/* Details */}
                <div className="space-y-3 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      !notif.isRead ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {!notif.isRead ? 'Chưa đọc' : 'Đã đọc'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(notif.createdAt).toLocaleString('vi-VN')}
                    </span>
                  </div>

                  <h3 className="font-bold text-gray-900 text-base">{notif.title}</h3>
                  <p className="text-sm text-gray-600 whitespace-pre-line">{notif.message}</p>

                  {/* Review Detail Box */}
                  {hasReview && (
                    <div className="mt-2 bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm space-y-2">
                      <p className="font-semibold text-gray-700">Chi tiết bình luận:</p>
                      <div>
                        <span className="text-gray-400">Món ăn: </span>
                        <span className="font-medium text-gray-900">{notif.review.recipe?.name || 'Món đã bị xóa'}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Nội dung gốc: </span>
                        <span className="font-medium text-red-700">{notif.review.originalReview}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Nội dung hiển thị (Censored): </span>
                        <span className="font-medium text-gray-700">{notif.review.review}</span>
                      </div>
                      {notif.review.flaggedWords && (
                        <div>
                          <span className="text-gray-400">Từ cấm phát hiện: </span>
                          <span className="font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded text-xs">{notif.review.flaggedWords}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-gray-400">Trạng thái kiểm duyệt: </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          notif.review.moderationStatus === 'pending' ? 'bg-amber-100 text-amber-700' :
                          notif.review.moderationStatus === 'reviewed' ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {notif.review.moderationStatus === 'pending' ? 'Đang chờ duyệt' :
                           notif.review.moderationStatus === 'reviewed' ? 'Đã duyệt' : 'Đã gỡ bỏ'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Violator stats */}
                  {hasUser && (
                    <div className="flex items-center gap-2 mt-2 bg-purple-50/50 border border-purple-100 rounded-xl p-3 text-xs text-purple-900 w-fit">
                      <HiUserCircle className="text-purple-600 text-lg" />
                      <div>
                        Thành viên: <span className="font-bold">{notif.user.fullName}</span> ({notif.user.email}) | 
                        Số lần vi phạm: <span className="font-bold text-red-600">{notif.user.violationCount}</span>
                        {isLocked && <span className="ml-1 text-red-600 font-extrabold">(Tài khoản đang bị khóa bình luận)</span>}
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-row md:flex-col gap-2 w-full md:w-auto shrink-0 pt-4 md:pt-0 border-t md:border-t-0 border-gray-100">
                  {!notif.isRead && (
                    <button
                      onClick={() => handleMarkAsRead(notif.id)}
                      className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold rounded-xl text-xs transition"
                    >
                      <HiEye />
                      Đánh dấu đã đọc
                    </button>
                  )}
                  {hasReview && notif.review.moderationStatus === 'pending' && (
                    <>
                      <button
                        onClick={() => handleApproveReview(notif.reviewId)}
                        className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs transition shadow-sm"
                      >
                        <HiCheck />
                        Phê duyệt (Hiển thị)
                      </button>
                      <button
                        onClick={() => handleRejectReview(notif.reviewId)}
                        className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl text-xs transition shadow-sm"
                      >
                        <HiTrash />
                        Gỡ bỏ bình luận
                      </button>
                    </>
                  )}
                  {hasUser && (notif.user.violationCount > 0 || isLocked) && (
                    <button
                      onClick={() => handleUnlockUser(notif.userId)}
                      className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl text-xs transition shadow-sm"
                    >
                      <HiLockOpen />
                      Mở khóa User
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
