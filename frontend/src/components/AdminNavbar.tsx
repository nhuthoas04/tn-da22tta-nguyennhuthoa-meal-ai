'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  HiBell,
  HiBookOpen,
  HiChartBar,
  HiClipboardCheck,
  HiLogout,
  HiMenu,
  HiShieldCheck,
  HiUsers,
  HiX,
} from 'react-icons/hi';
import { useAuth } from '@/context/AuthContext';

const adminNavItems = [
  { href: '/admin', label: 'Tổng quan', icon: HiChartBar },
  { href: '/admin/users', label: 'Người dùng', icon: HiUsers },
  { href: '/admin/recipes', label: 'Công thức', icon: HiBookOpen },
  {
    href: '/admin/pending',
    label: 'Công thức chờ duyệt',
    icon: HiClipboardCheck,
  },
  {
    href: '/admin/notifications',
    label: 'Cảnh báo nội dung',
    icon: HiBell,
  },
];

interface AdminNavbarProps {
  unreadNotifications: number;
}

export default function AdminNavbar({
  unreadNotifications,
}: AdminNavbarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-emerald-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-4 px-4 sm:h-16 sm:px-6 lg:px-8">
          <Link href="/admin" className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <HiShieldCheck className="text-xl" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-base font-extrabold text-slate-900">
                Meal<span className="text-emerald-600">AI</span> Admin
              </span>
              <span className="hidden text-[11px] font-medium text-slate-500 sm:block">
                Hệ thống quản trị
              </span>
            </span>
          </Link>

          <div className="hidden items-center gap-3 lg:flex">
            <Link
              href="/admin/notifications"
              className="relative rounded-lg p-2 text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-700"
              title="Cảnh báo nội dung"
            >
              <HiBell className="text-xl" />
              {unreadNotifications > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </span>
              )}
            </Link>
            <div className="border-l border-slate-200 pl-4 text-right">
              <p className="max-w-48 truncate text-sm font-semibold text-slate-800">
                {user?.fullName || 'Quản trị viên'}
              </p>
              <p className="max-w-48 truncate text-xs text-slate-500">
                {user?.email}
              </p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg p-2 text-slate-500 transition hover:bg-red-50 hover:text-red-600"
              title="Đăng xuất"
            >
              <HiLogout className="text-xl" />
            </button>
          </div>

          <button
            type="button"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label={mobileOpen ? 'Đóng menu quản trị' : 'Mở menu quản trị'}
          >
            {mobileOpen ? <HiX className="text-2xl" /> : <HiMenu className="text-2xl" />}
          </button>
        </div>

        {mobileOpen && (
          <nav className="border-t border-slate-100 bg-white px-3 py-3 lg:hidden">
            <div className="mb-2 px-3 py-2">
              <p className="truncate text-sm font-semibold text-slate-800">
                {user?.fullName || 'Quản trị viên'}
              </p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
            </div>
            {adminNavItems.map((item) => {
              const active =
                item.href === '/admin'
                  ? pathname === '/admin'
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                    active
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <item.icon className="text-lg" />
                  <span>{item.label}</span>
                  {item.href === '/admin/notifications' &&
                    unreadNotifications > 0 && (
                      <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
                        {unreadNotifications}
                      </span>
                    )}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={logout}
              className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <HiLogout className="text-lg" />
              Đăng xuất
            </button>
          </nav>
        )}
      </header>
      <div className="h-14 sm:h-16" />
    </>
  );
}
