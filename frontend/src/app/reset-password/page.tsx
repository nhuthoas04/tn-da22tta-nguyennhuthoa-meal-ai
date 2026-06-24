'use client';

import { useState, useEffect, Suspense } from 'react';
import { authAPI } from '@/lib/api';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { HiSparkles, HiExclamationCircle, HiCheckCircle } from 'react-icons/hi';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const qToken = searchParams.get('token');
    if (qToken) {
      setToken(qToken);
    } else {
      setErrorMsg('LiÃªn káº¿t Ä‘áº·t láº¡i máº­t kháº©u khÃ´ng há»£p lá»‡ hoáº·c Ä‘Ã£ háº¿t háº¡n.');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!token) {
      setErrorMsg('LiÃªn káº¿t Ä‘áº·t láº¡i máº­t kháº©u khÃ´ng há»£p lá»‡ hoáº·c Ä‘Ã£ háº¿t háº¡n.');
      return;
    }

    if (!newPassword || !confirmPassword) {
      toast.error('Vui lÃ²ng Ä‘iá»n Ä‘áº§y Ä‘á»§ máº­t kháº©u');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('Máº­t kháº©u pháº£i cÃ³ tá»‘i thiá»ƒu 6 kÃ½ tá»±');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('Máº­t kháº©u xÃ¡c nháº­n khÃ´ng khá»›p');
      return;
    }

    setLoading(true);

    try {
      const res = await authAPI.resetPassword({
        token,
        newPassword,
        confirmPassword,
      });
      setSuccess(true);
      toast.success(res.data.message || 'Äáº·t láº¡i máº­t kháº©u thÃ nh cÃ´ng!');

      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (err: any) {
      console.error(err);
      const apiMsg = err.response?.data?.message || 'LiÃªn káº¿t Ä‘áº·t láº¡i máº­t kháº©u khÃ´ng há»£p lá»‡ hoáº·c Ä‘Ã£ háº¿t háº¡n.';
      setErrorMsg('LiÃªn káº¿t Ä‘áº·t láº¡i máº­t kháº©u khÃ´ng há»£p lá»‡ hoáº·c Ä‘Ã£ háº¿t háº¡n.');
      toast.error(apiMsg);
    } finally {
      setLoading(false);
    }
  };

  if (errorMsg && !success) {
    return (
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 text-center space-y-5">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-50 text-red-500 mb-2">
          <HiExclamationCircle className="text-4xl" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">KhÃ´ng thá»ƒ thá»±c hiá»‡n</h2>
        <p className="text-sm text-gray-600 leading-relaxed px-4">
          {errorMsg}
        </p>
        <div className="pt-4 flex flex-col gap-2">
          <Link
            href="/forgot-password"
            className="inline-flex justify-center w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-md transition duration-200"
          >
            YÃªu cáº§u liÃªn káº¿t má»›i
          </Link>
          <Link
            href="/login"
            className="inline-flex justify-center w-full px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition duration-200"
          >
            Quay láº¡i Ä‘Äƒng nháº­p
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 text-center space-y-5">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 mb-2">
          <HiCheckCircle className="text-4xl" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Äáº·t láº¡i máº­t kháº©u thÃ nh cÃ´ng</h2>
        <p className="text-sm text-gray-600 leading-relaxed">
          Máº­t kháº©u cá»§a báº¡n Ä‘Ã£ Ä‘Æ°á»£c thay Ä‘á»•i thÃ nh cÃ´ng. Há»‡ thá»‘ng Ä‘ang chuyá»ƒn hÆ°á»›ng báº¡n vá» trang Ä‘Äƒng nháº­p...
        </p>
        <div className="pt-4 animate-pulse text-sm text-emerald-600 font-medium">
          Äang chuyá»ƒn hÆ°á»›ng...
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 space-y-6">
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-gray-700">Máº­t kháº©u má»›i</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
          placeholder="Nháº­p máº­t kháº©u má»›i (tá»‘i thiá»ƒu 6 kÃ½ tá»±)"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-gray-700">XÃ¡c nháº­n máº­t kháº©u má»›i</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
          placeholder="XÃ¡c nháº­n láº¡i máº­t kháº©u má»›i"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-[0.98]"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Äang lÆ°u máº­t kháº©u má»›i...
          </span>
        ) : (
          'Äáº·t láº¡i máº­t kháº©u'
        )}
      </button>

      <div className="text-center pt-2">
        <Link
          href="/login"
          className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 hover:underline transition"
        >
          Quay láº¡i Ä‘Äƒng nháº­p
        </Link>
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 bg-gray-50/50">
      <div className="w-full max-w-md">
        {/* Logo Section */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 mb-4 shadow-sm">
            <HiSparkles className="text-3xl" />
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            Meal<span className="text-emerald-600">AI</span>
          </h1>
          <p className="text-gray-500 mt-2">Thiáº¿t láº­p láº¡i máº­t kháº©u má»›i cho tÃ i khoáº£n cá»§a báº¡n</p>
        </div>

        <Suspense fallback={
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 text-center space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mx-auto"></div>
            <p className="text-sm text-gray-500">Äang táº£i biá»ƒu máº«u Ä‘áº·t láº¡i máº­t kháº©u...</p>
          </div>
        }>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
