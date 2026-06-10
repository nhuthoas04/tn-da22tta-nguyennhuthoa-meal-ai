'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { notificationsAPI } from '@/lib/api';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { HiBell, HiCheck, HiOutlineInbox, HiChevronLeft, HiChevronRight } from 'react-icons/hi';
import Link from 'next/link';

export default function NotificationsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const loadNotifications = async (targetPage = 1) => {
    setLoading(true);
    try {
      const res = await notificationsAPI.getAll({ page: targetPage, limit: 10 });
      setNotifications(res.data.data || []);
      setTotalPages(res.data.meta?.totalPages || 1);
      setTotal(res.data.meta?.total || 0);
      setPage(targetPage);
    } catch {
      toast.error('Không thể tải danh sách thông báo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadNotifications(1);
    }
  }, [user]);

  const handleNotificationClick = async (notif: any) => {
    try {
      if (!notif.isRead) {
        await notificationsAPI.markAsRead(notif.id);
        // Dispatch window event to refresh navbar count
        window.dispatchEvent(new Event('update-personal-notifications-count'));
      }
      if (notif.post?.id) {
        router.push(`/recipes/${notif.post.id}`);
      } else {
        // Refresh list
        loadNotifications(page);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsAPI.markAllAsRead();
      toast.success('Đã đánh dấu đọc tất cả thông báo!');
      window.dispatchEvent(new Event('update-personal-notifications-count'));
      loadNotifications(1);
    } catch (err) {
      console.error(err);
      toast.error('Có lỗi xảy ra.');
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'LIKE_POST': return '👍';
      case 'RATE_POST': return '⭐';
      case 'COMMENT_POST': return '💬';
      case 'REPLY_COMMENT': return '↩️';
      case 'SAVE_RECIPE': return '💾';
      default: return '🔔';
    }
  };

  const formatRelativeTime = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'Vừa xong';
    if (diffMin < 60) return `${diffMin} phút trước`;
    if (diffHour < 24) return `${diffHour} giờ trước`;
    if (diffDay === 1) return 'Hôm qua';
    return `${diffDay} ngày trước`;
  };

  if (!user) {
    return (
      <div className="text-center py-20 bg-brand-light-bg min-h-screen flex flex-col justify-center items-center">
        <p className="text-5xl mb-4 animate-brand-float">🔔</p>
        <p className="text-slate-500">Vui lòng <Link href="/login" className="text-brand-primary font-bold underline hover:text-brand-primary-hover">đăng nhập</Link> để xem thông báo.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto px-4 py-6 bg-brand-light-bg min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-brand-light-border pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <HiBell className="text-brand-primary" /> Thông báo cá nhân
          </h1>
          <p className="text-xs text-slate-400 font-semibold mt-1">
            Theo dõi tất cả lượt thích, đánh giá và tương tác về công thức món ăn của bạn ({total})
          </p>
        </div>
        {notifications.some(n => !n.isRead) && (
          <button
            onClick={handleMarkAllRead}
            className="flex items-center justify-center gap-1.5 px-4 py-2 border border-brand-primary bg-brand-primary/5 hover:bg-brand-primary/10 text-brand-primary text-xs font-bold rounded-brand-sm transition-all cursor-pointer shadow-brand-sm"
          >
            <HiCheck className="text-base" /> Đánh dấu đọc tất cả
          </button>
        )}
      </div>

      {loading && notifications.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white border border-brand-light-border rounded-brand-md p-5 h-20 animate-pulse" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="bg-white border border-brand-light-border rounded-brand-lg p-16 text-center shadow-brand-sm flex flex-col justify-center items-center">
          <HiOutlineInbox className="text-6xl text-slate-300 mb-3" />
          <h3 className="font-bold text-slate-800 text-lg">Hộp thư thông báo trống</h3>
          <p className="text-slate-400 text-sm mt-1">Bạn chưa nhận được bất kỳ tương tác nào từ người dùng khác.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="bg-white border border-brand-light-border rounded-brand-lg divide-y divide-brand-light-border overflow-hidden shadow-brand-sm">
            {notifications.map((notif) => (
              <button
                key={notif.id}
                onClick={() => handleNotificationClick(notif)}
                className={`w-full text-left p-5 flex items-start gap-4 hover:bg-slate-50 transition-all cursor-pointer border-none bg-transparent ${
                  !notif.isRead ? 'bg-brand-primary/5' : ''
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-brand-primary/10 flex items-center justify-center shrink-0 text-lg font-bold text-brand-primary overflow-hidden shadow-brand-sm">
                  {notif.actor?.avatarUrl ? (
                    <img src={notif.actor.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <span>{getNotificationIcon(notif.type)}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-3">
                    <p className="text-sm text-slate-700 font-semibold leading-relaxed break-words">
                      {notif.message}
                    </p>
                    {!notif.isRead && (
                      <span className="w-2.5 h-2.5 rounded-full bg-brand-primary shrink-0 mt-1.5" title="Chưa đọc" />
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-450 font-medium">
                    <span>{formatRelativeTime(notif.createdAt)}</span>
                    {notif.post && (
                      <>
                        <span className="text-slate-300">•</span>
                        <span className="text-brand-primary font-bold">{notif.post.name}</span>
                      </>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                onClick={() => loadNotifications(page - 1)}
                disabled={page === 1}
                className="p-2 border border-brand-light-border bg-white rounded-brand-sm hover:bg-slate-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                aria-label="Trang trước"
              >
                <HiChevronLeft className="text-lg" />
              </button>
              <span className="text-xs font-bold text-slate-600 px-3">
                Trang {page} / {totalPages}
              </span>
              <button
                onClick={() => loadNotifications(page + 1)}
                disabled={page === totalPages}
                className="p-2 border border-brand-light-border bg-white rounded-brand-sm hover:bg-slate-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                aria-label="Trang sau"
              >
                <HiChevronRight className="text-lg" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
