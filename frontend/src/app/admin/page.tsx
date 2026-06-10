'use client';
import { useEffect, useState } from 'react';
import { adminAPI } from '@/lib/api';
import Link from 'next/link';
import {
  HiBookOpen, HiClipboardCheck, HiCheckCircle, HiXCircle, HiPlus,
} from 'react-icons/hi';

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const res = await adminAPI.getStats();
      setStats(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Tổng quan</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-white rounded-2xl border border-gray-200 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: 'Tổng công thức',
      value: stats?.totalRecipes || 0,
      icon: HiBookOpen,
      color: 'bg-blue-50 text-blue-600',
      iconBg: 'bg-blue-100',
      href: '/admin/recipes',
    },
    {
      label: 'Đã duyệt',
      value: stats?.approvedCount || 0,
      icon: HiCheckCircle,
      color: 'bg-emerald-50 text-emerald-600',
      iconBg: 'bg-emerald-100',
      href: '/admin/recipes?status=approved',
    },
    {
      label: 'Chờ duyệt',
      value: stats?.pendingCount || 0,
      icon: HiClipboardCheck,
      color: 'bg-amber-50 text-amber-600',
      iconBg: 'bg-amber-100',
      href: '/admin/pending',
    },
    {
      label: 'Đã từ chối',
      value: stats?.rejectedCount || 0,
      icon: HiXCircle,
      color: 'bg-red-50 text-red-600',
      iconBg: 'bg-red-100',
      href: '/admin/recipes?status=rejected',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tổng quan</h1>
          <p className="text-gray-500 mt-1">Quản lý công thức và duyệt bài đăng</p>
        </div>
        <Link
          href="/admin/recipes/create"
          className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors"
        >
          <HiPlus className="text-lg" />
          Tạo công thức
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => {
          const cardContent = (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium opacity-80">{card.label}</p>
                <p className="text-3xl font-bold mt-1">{card.value}</p>
              </div>
              <div className={`w-12 h-12 ${card.iconBg} rounded-xl flex items-center justify-center`}>
                <card.icon className="text-2xl" />
              </div>
            </div>
          );

          if (card.href) {
            return (
              <Link
                key={i}
                href={card.href}
                className={`${card.color} rounded-2xl p-5 border border-transparent hover:border-gray-200 hover:shadow-md cursor-pointer transition-all`}
              >
                {cardContent}
              </Link>
            );
          }

          return (
            <div
              key={i}
              className={`${card.color} rounded-2xl p-5 border border-transparent transition-all`}
            >
              {cardContent}
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Hành động nhanh</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link
            href="/admin/recipes/create"
            className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-all"
          >
            <HiPlus className="text-2xl text-purple-600" />
            <div>
              <p className="font-medium text-gray-900">Tạo công thức mới</p>
              <p className="text-xs text-gray-500">Thêm công thức vào hệ thống</p>
            </div>
          </Link>
          <Link
            href="/admin/recipes"
            className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all"
          >
            <HiBookOpen className="text-2xl text-blue-600" />
            <div>
              <p className="font-medium text-gray-900">Quản lý công thức</p>
              <p className="text-xs text-gray-500">Sửa, xóa công thức hiện có</p>
            </div>
          </Link>
          <Link
            href="/admin/pending"
            className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 hover:border-amber-300 hover:bg-amber-50 transition-all"
          >
            <HiClipboardCheck className="text-2xl text-amber-600" />
            <div>
              <p className="font-medium text-gray-900">Duyệt bài đăng</p>
              <p className="text-xs text-gray-500">{stats?.pendingCount || 0} bài chờ duyệt</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
