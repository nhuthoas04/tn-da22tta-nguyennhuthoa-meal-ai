'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useEffect, useState, useRef } from 'react';
import { adminModerationAPI } from '@/lib/api';
import {
  HiHome, HiBookOpen, HiCalendar, HiShoppingCart,
  HiCube, HiUser, HiMenu, HiX, HiLogout, HiSparkles, HiChartBar,
  HiShieldCheck, HiBell, HiHeart,
} from 'react-icons/hi';
import { notificationsAPI } from '@/lib/api';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

const navItems = [
  { href: '/', label: 'Trang chủ', icon: HiHome },
  { href: '/recipes', label: 'Công thức', icon: HiBookOpen },
  { href: '/favorites', label: 'Yêu thích', icon: HiHeart },
  { href: '/meal-planner', label: 'Thực đơn', icon: HiCalendar },
  { href: '/nutrition', label: 'Dinh dưỡng', icon: HiChartBar },
  { href: '/insights', label: 'AI Insights', icon: HiSparkles },
  { href: '/shopping-list', label: 'Mua sắm', icon: HiShoppingCart },
  { href: '/inventory', label: 'Tủ lạnh', icon: HiCube },
  { href: '/profile', label: 'Cá nhân', icon: HiUser },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isAdmin } = useAuth();
  const isDarkNavbar = false;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  
  // Personal Notifications
  const [personalUnreadCount, setPersonalUnreadCount] = useState(0);
  const [personalNotifications, setPersonalNotifications] = useState<any[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const notifiedIdsRef = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef(true);

  const checkNewNotifications = async () => {
    try {
      const countRes = await notificationsAPI.getUnreadCount();
      const newCount = countRes.data.count || 0;
      setPersonalUnreadCount(newCount);

      const listRes = await notificationsAPI.getAll({ page: 1, limit: 5 });
      const list = listRes.data.data || [];
      setPersonalNotifications(list);

      // Check for new unread notifications and display toast
      list.forEach((notif: any) => {
        if (!notif.isRead && !notifiedIdsRef.current.has(notif.id)) {
          notifiedIdsRef.current.add(notif.id);

          if (!isFirstLoadRef.current) {
            toast((t) => (
              <div 
                className="flex flex-col text-xs font-bold text-slate-800 cursor-pointer text-left" 
                onClick={() => {
                  toast.dismiss(t.id);
                  handleNotificationClick(notif);
                }}
              >
                <span className="flex items-center gap-1.5 font-extrabold text-brand-primary">
                  {getNotificationIcon(notif.type)} Tương tác mới
                </span>
                <span className="mt-1 font-medium text-slate-600 leading-tight">{notif.message}</span>
              </div>
            ), { duration: 5000, position: 'bottom-left' });
          }
        }
      });

      isFirstLoadRef.current = false;
    } catch {
      // ignore
    }
  };

  const loadPersonalUnreadCount = checkNewNotifications;

  const loadPersonalNotifications = async () => {
    try {
      const res = await notificationsAPI.getAll({ page: 1, limit: 5 });
      setPersonalNotifications(res.data.data || []);
    } catch {
      // ignore
    }
  };

  const toggleNotificationDropdown = async () => {
    if (!dropdownOpen) {
      await loadPersonalNotifications();
      await loadPersonalUnreadCount();
    }
    setDropdownOpen(!dropdownOpen);
  };

  const handleNotificationClick = async (notif: any) => {
    setDropdownOpen(false);
    try {
      if (!notif.isRead) {
        await notificationsAPI.markAsRead(notif.id);
        loadPersonalUnreadCount();
      }
      if (notif.post?.id) {
        router.push(`/recipes/${notif.post.id}`);
      } else {
        router.push('/notifications');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await notificationsAPI.markAllAsRead();
      loadPersonalUnreadCount();
      loadPersonalNotifications();
    } catch (err) {
      console.error(err);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
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

  useEffect(() => {
    if (!dropdownOpen) return;
    const closeDropdown = () => setDropdownOpen(false);
    document.addEventListener('click', closeDropdown);
    return () => document.removeEventListener('click', closeDropdown);
  }, [dropdownOpen]);

  useEffect(() => {
    if (user) {
      loadPersonalUnreadCount();
      const interval = setInterval(loadPersonalUnreadCount, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  useEffect(() => {
    const handler = () => {
      if (user) {
        loadPersonalUnreadCount();
        if (dropdownOpen) {
          loadPersonalNotifications();
        }
      }
    };
    window.addEventListener('update-personal-notifications-count', handler);
    return () => window.removeEventListener('update-personal-notifications-count', handler);
  }, [user, dropdownOpen]);

  useEffect(() => {
    if (user && isAdmin) {
      loadUnreadCount();
      const interval = setInterval(loadUnreadCount, 15000);
      return () => clearInterval(interval);
    }
  }, [user, isAdmin]);

  useEffect(() => {
    const handler = () => {
      if (user && isAdmin) loadUnreadCount();
    };
    window.addEventListener('update-notifications-count', handler);
    return () => window.removeEventListener('update-notifications-count', handler);
  }, [user, isAdmin]);

  const loadUnreadCount = async () => {
    try {
      const res = await adminModerationAPI.getNotifications();
      setUnreadNotifications(res.data.unreadCount || 0);
    } catch {
      // ignore
    }
  };

  return (
    <>
      {/* Desktop Navbar */}
      <nav className={`fixed top-0 left-0 right-0 z-50 backdrop-blur-md transition-colors duration-300 ${
        isDarkNavbar
          ? 'bg-brand-navy/80 border-b border-slate-800 text-white'
          : 'bg-white/80 border-b border-gray-200 text-gray-900'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2">
              <HiSparkles className="text-2xl text-emerald-500" />
              <span className={`font-bold text-xl ${isDarkNavbar ? 'text-white' : 'text-gray-900'}`}>
                Meal<span className="text-emerald-500">AI</span>
              </span>
            </Link>

            {/* Desktop Links */}
            <div className="hidden lg:flex items-center gap-1.5">
              {user && navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-brand-primary/20 ${
                      isActive
                        ? isDarkNavbar
                          ? 'bg-emerald-950/50 text-brand-primary'
                          : 'bg-brand-primary/10 text-brand-primary'
                        : isDarkNavbar
                          ? 'text-slate-300 hover:bg-brand-secondary/10 hover:text-brand-secondary'
                          : 'text-slate-600 hover:bg-brand-secondary/10 hover:text-brand-secondary'
                    }`}
                  >
                    <item.icon className="text-lg" />
                    {item.label}
                  </Link>
                );
              })}
            </div>

            {/* User / Auth */}
            <div className="hidden lg:flex items-center gap-3">
              {user ? (
                <>
                  <span className={`text-sm ${isDarkNavbar ? 'text-slate-300' : 'text-gray-600'}`}>
                    {user.fullName}
                  </span>

                  {/* Bell Icon & Dropdown for Personal Notifications */}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleNotificationDropdown();
                      }}
                      className={`p-2 rounded-lg transition-colors relative focus:outline-none cursor-pointer ${
                        isDarkNavbar ? 'text-slate-400 hover:text-emerald-400 hover:bg-slate-800' : 'text-gray-500 hover:text-brand-primary hover:bg-gray-100'
                      }`}
                      title="Thông báo"
                    >
                      <HiBell className="text-xl" />
                      {personalUnreadCount > 0 && (
                        <span className="absolute top-1 right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white ring-2 ring-white animate-pulse">
                          {personalUnreadCount > 9 ? '9+' : personalUnreadCount}
                        </span>
                      )}
                    </button>
                    {dropdownOpen && (
                      <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-xl z-50 animate-fade-in overflow-hidden text-gray-800">
                        <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                          <span className="text-sm font-bold text-gray-800">Thông báo cá nhân</span>
                          {personalUnreadCount > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                markAllAsRead();
                              }}
                              className="text-xs text-brand-primary hover:underline font-semibold cursor-pointer"
                            >
                              Đọc tất cả
                            </button>
                          )}
                        </div>
                        <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
                          {personalNotifications.length === 0 ? (
                            <div className="p-4 text-center text-xs text-gray-400">Không có thông báo mới</div>
                          ) : (
                            personalNotifications.map((notif: any) => (
                              <button
                                key={notif.id}
                                onClick={() => handleNotificationClick(notif)}
                                className={`w-full text-left p-3 flex gap-2.5 hover:bg-gray-50 transition-all cursor-pointer border-none bg-transparent ${
                                  !notif.isRead ? 'bg-emerald-55/10' : ''
                                }`}
                              >
                                <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 text-sm font-bold overflow-hidden">
                                  {notif.actor?.avatarUrl ? (
                                    <img src={notif.actor.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                                  ) : (
                                    <span className="text-xs">{getNotificationIcon(notif.type)}</span>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs text-gray-700 font-semibold leading-relaxed break-words">
                                    {notif.message}
                                  </p>
                                  <span className="text-[10px] text-gray-400 mt-1 block">
                                    {formatRelativeTime(notif.createdAt)}
                                  </span>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                        <Link
                          href="/notifications"
                          onClick={() => setDropdownOpen(false)}
                          className="block text-center p-2.5 bg-gray-50 text-xs font-bold text-brand-primary hover:bg-gray-100 transition border-t border-gray-100"
                        >
                          Xem tất cả thông báo
                        </Link>
                      </div>
                    )}
                  </div>
                  {isAdmin && (
                    <Link
                      href="/admin"
                      className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-purple-500/20 relative ${
                        pathname.startsWith('/admin')
                          ? 'bg-purple-50 text-purple-700'
                          : 'text-purple-600 hover:bg-purple-50'
                      }`}
                    >
                      <HiShieldCheck className="text-lg" />
                      <span>Quản trị</span>
                      {unreadNotifications > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white animate-pulse">
                          {unreadNotifications > 9 ? '9+' : unreadNotifications}
                        </span>
                      )}
                    </Link>
                  )}
                  <button
                    onClick={logout}
                    className={`p-2 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/20 rounded-lg ${
                      isDarkNavbar ? 'text-slate-400 hover:text-red-400' : 'text-gray-500 hover:text-red-600'
                    }`}
                    title="Đăng xuất"
                  >
                    <HiLogout className="text-xl" />
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  className="btn-primary"
                >
                  Đăng nhập
                </Link>
              )}
            </div>

            {/* Mobile Menu Button / Mobile Login */}
            <div className="lg:hidden flex items-center">
              {user ? (
                <button
                  className={`p-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 rounded-lg ${
                    isDarkNavbar ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                  onClick={() => setMobileOpen(!mobileOpen)}
                >
                  {mobileOpen ? <HiX className="text-2xl" /> : <HiMenu className="text-2xl" />}
                </button>
              ) : (
                <Link
                  href="/login"
                  className="btn-primary text-xs px-3 py-1.5"
                >
                  Đăng nhập
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {user && mobileOpen && (
          <div className={`lg:hidden border-t pb-4 transition-colors duration-300 ${
            isDarkNavbar ? 'bg-brand-navy-card border-slate-800' : 'bg-white border-gray-200'
          }`}>
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors ${
                    isActive
                      ? isDarkNavbar
                        ? 'text-brand-primary bg-brand-primary/10'
                        : 'text-brand-primary bg-brand-primary/10'
                      : isDarkNavbar
                        ? 'text-slate-300 hover:bg-brand-secondary/10 hover:text-brand-secondary'
                        : 'text-slate-600 hover:bg-brand-secondary/10 hover:text-brand-secondary'
                  }`}
                >
                  <item.icon className="text-lg" />
                  {item.label}
                </Link>
              );
            })}
            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-6 py-3 text-sm font-medium relative ${
                  pathname.startsWith('/admin') ? 'text-purple-700 bg-purple-50' : 'text-purple-600 hover:bg-purple-50'
                }`}
              >
                <HiShieldCheck className="text-lg" />
                <span>Quản trị</span>
                {unreadNotifications > 0 && (
                  <span className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
                    {unreadNotifications}
                  </span>
                )}
              </Link>
            )}
            <Link
              href="/notifications"
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-6 py-3 text-sm font-medium relative ${
                pathname === '/notifications' ? 'text-brand-primary bg-brand-primary/10' : 'text-slate-600 hover:bg-brand-secondary/10 hover:text-brand-secondary'
              }`}
            >
              <HiBell className="text-lg" />
              <span>Thông báo</span>
              {personalUnreadCount > 0 && (
                <span className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
                  {personalUnreadCount}
                </span>
              )}
            </Link>
            <button
              onClick={logout}
              className="flex items-center gap-3 px-6 py-3 text-sm text-red-600 w-full animate-none"
            >
              <HiLogout className="text-lg" />
              Đăng xuất
            </button>
          </div>
        )}
      </nav>

      {/* Spacer for fixed navbar */}
      <div className="h-16" />
    </>
  );
}
