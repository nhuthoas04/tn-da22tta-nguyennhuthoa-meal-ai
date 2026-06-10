'use client';
import { useAuth } from '@/context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
import {
  HiChartBar, HiBookOpen, HiClipboardCheck, HiArrowLeft, HiUsers, HiBell, HiMicrophone,
} from 'react-icons/hi';

const adminNav = [
  { href: '/admin', label: 'Tổng quan', icon: HiChartBar },
  { href: '/admin/recipes', label: 'Công thức', icon: HiBookOpen },
  { href: '/admin/pending', label: 'Chờ duyệt', icon: HiClipboardCheck },
  { href: '/admin/users', label: 'Thành viên', icon: HiUsers },
  { href: '/admin/notifications', label: 'Cảnh báo', icon: HiBell },
  { href: '/admin/voice-dashboard', label: 'Thống kê thoại AI', icon: HiMicrophone },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.push('/');
    }
  }, [user, loading, isAdmin, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="flex gap-6 min-h-[calc(100vh-100px)]">
      {/* Sidebar */}
      <aside className="w-64 shrink-0">
        <div className="bg-white rounded-2xl border border-gray-200 p-4 sticky top-24">
          <div className="flex items-center gap-2 mb-6 pb-4 border-b border-gray-200">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
              <span className="text-white text-lg font-bold">A</span>
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">Admin Panel</p>
              <p className="text-xs text-gray-500">{user?.email}</p>
            </div>
          </div>

          <nav className="space-y-1">
            {adminNav.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-purple-50 text-purple-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <item.icon className="text-lg" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-6 pt-4 border-t border-gray-200">
            <Link
              href="/"
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <HiArrowLeft />
              Về trang chủ
            </Link>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0">
        {children}
      </main>
    </div>
  );
}
