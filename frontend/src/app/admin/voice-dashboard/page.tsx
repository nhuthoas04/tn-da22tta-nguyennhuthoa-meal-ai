'use client';

import React, { useEffect, useState } from 'react';
import { chatbotAPI } from '@/lib/api';
import { HiMicrophone, HiCheckCircle, HiTrendingUp, HiUsers, HiLightningBolt } from 'react-icons/hi';
import toast from 'react-hot-toast';

export default function VoiceDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadVoiceStats();
  }, []);

  const loadVoiceStats = async () => {
    setLoading(true);
    try {
      const res = await chatbotAPI.getVoiceStats();
      setStats(res.data?.data || res.data || null);
    } catch (err: any) {
      console.error(err);
      toast.error('Không thể lấy thống kê thoại AI.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <HiMicrophone className="text-brand-primary animate-pulse" /> Thống Kê Giọng Nói AI
        </h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-white rounded-2xl border border-gray-200 animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-white rounded-2xl border border-gray-200 animate-pulse" />
      </div>
    );
  }

  const cards = [
    {
      label: 'Tổng số lệnh thoại',
      value: stats?.totalCommands || 0,
      icon: HiMicrophone,
      color: 'bg-emerald-50 text-emerald-600 border-emerald-100',
      iconBg: 'bg-emerald-100',
    },
    {
      label: 'Tỷ lệ thành công',
      value: `${stats?.successRate ?? 100}%`,
      icon: HiCheckCircle,
      color: 'bg-teal-50 text-teal-600 border-teal-100',
      iconBg: 'bg-teal-100',
    },
    {
      label: 'Độ chính xác & phản hồi',
      value: 'Tức thì (Real-time)',
      icon: HiLightningBolt,
      color: 'bg-amber-50 text-amber-600 border-amber-100',
      iconBg: 'bg-amber-100',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <HiMicrophone className="text-brand-primary" /> Thống Kê Giọng Nói AI
        </h1>
        <p className="text-gray-500 mt-1">Giám sát hoạt động, tần suất và chất lượng nhận diện lệnh thoại trong hệ thống</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map((card, i) => (
          <div
            key={i}
            className={`${card.color} rounded-2xl p-5 border shadow-brand-sm flex items-center justify-between`}
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider opacity-80">{card.label}</p>
              <p className="text-2xl font-bold mt-1.5">{card.value}</p>
            </div>
            <div className={`w-12 h-12 ${card.iconBg} rounded-xl flex items-center justify-center`}>
              <card.icon className="text-2xl" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Most Used Intents */}
        <div className="bg-white rounded-2xl border border-brand-light-border p-6 shadow-brand-sm">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
            <HiTrendingUp className="text-brand-primary" /> Lệnh thoại được dùng nhiều nhất
          </h2>
          {stats?.intentStats && stats.intentStats.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400 font-bold">
                    <th className="pb-3 pl-2">Lệnh hệ thống (Intent)</th>
                    <th className="pb-3 text-right pr-2">Số lượt gọi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {stats.intentStats.map((item: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-3 pl-2 font-mono text-xs text-indigo-600 font-semibold">{item.intent}</td>
                      <td className="py-3 text-right pr-2 font-bold text-slate-800">{item.count} lượt</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center text-gray-400 text-sm font-medium">
              Chưa ghi nhận lệnh thoại nào kích hoạt thành công hành động
            </div>
          )}
        </div>

        {/* Top Active Voice Users */}
        <div className="bg-white rounded-2xl border border-brand-light-border p-6 shadow-brand-sm">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
            <HiUsers className="text-brand-primary" /> Thành viên sử dụng nhiều nhất
          </h2>
          {stats?.topUsers && stats.topUsers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400 font-bold">
                    <th className="pb-3 pl-2">Thành viên</th>
                    <th className="pb-3 text-right pr-2">Tổng số lệnh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {stats.topUsers.map((item: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-3 pl-2">
                        <p className="font-bold text-slate-800">{item.fullName}</p>
                        <p className="text-xs text-slate-400">{item.email}</p>
                      </td>
                      <td className="py-3 text-right pr-2 font-bold text-brand-primary">{item.count} lệnh</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center text-gray-400 text-sm font-medium">
              Chưa ghi nhận thành viên nào sử dụng lệnh thoại
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
