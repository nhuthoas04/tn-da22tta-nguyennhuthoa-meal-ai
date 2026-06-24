'use client';

import { useState } from 'react';
import { authAPI } from '@/lib/api';
import Link from 'next/link';
import { HiSparkles, HiCheckCircle } from 'react-icons/hi';
import toast from 'react-hot-toast';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const validateEmail = (val: string) => {
    if (!val) {
      return 'Email khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng';
    }
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(val)) {
      return 'Email khÃ´ng Ä‘Ãºng Ä‘á»‹nh dáº¡ng';
    }
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const validationError = validateEmail(email);
    if (validationError) {
      setErrorMsg(validationError);
      toast.error(validationError);
      return;
    }

    setLoading(true);

    try {
      const res = await authAPI.forgotPassword(email);
      setSuccess(true);
      toast.success(res.data.message || 'YÃªu cáº§u Ä‘áº·t láº¡i máº­t kháº©u Ä‘Ã£ Ä‘Æ°á»£c ghi nháº­n!');
    } catch (err: any) {
      console.error(err);
      // Under all circumstances, we show a success status, but if it is a physical network/connection error we toast it
      if (err.code === 'ERR_NETWORK' || !err.response) {
        toast.error('Lá»—i káº¿t ná»‘i máº¡ng. Vui lÃ²ng thá»­ láº¡i sau.');
        setErrorMsg('Lá»—i káº¿t ná»‘i mÃ¡y chá»§. Vui lÃ²ng thá»­ láº¡i sau.');
      } else {
        // Safe backend will return success even if email does not exist.
        // We set success true here to be consistent.
        setSuccess(true);
      }
    } finally {
      setLoading(false);
    }
  };

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
          <p className="text-gray-500 mt-2">Nháº­p email cá»§a báº¡n Ä‘á»ƒ láº¥y láº¡i máº­t kháº©u</p>
        </div>

        {/* Content Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          {success ? (
            <div className="text-center py-6 space-y-5">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 mb-2">
                <HiCheckCircle className="text-4xl" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Kiá»ƒm tra há»™p thÆ° cá»§a báº¡n</h2>
              <p className="text-sm text-gray-600 leading-relaxed px-2">
                Náº¿u email <strong>{email}</strong> tá»“n táº¡i trong há»‡ thá»‘ng, liÃªn káº¿t Ä‘áº·t láº¡i máº­t kháº©u Ä‘Ã£ Ä‘Æ°á»£c gá»­i. Vui lÃ²ng kiá»ƒm tra vÃ  nháº¥p vÃ o liÃªn káº¿t Ä‘á»ƒ táº¡o máº­t kháº©u má»›i.
              </p>
              <div className="pt-4">
                <Link
                  href="/login"
                  className="inline-flex justify-center w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-md transition duration-200"
                >
                  Quay láº¡i Ä‘Äƒng nháº­p
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700">
                  Äá»‹a chá»‰ Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  className={`w-full px-4 py-3 border rounded-xl outline-none transition focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 ${
                    errorMsg ? 'border-red-500 focus:ring-red-500/10' : 'border-gray-200'
                  }`}
                  placeholder="name@example.com"
                  autoComplete="email"
                />
                {errorMsg && (
                  <p className="text-xs font-medium text-red-500 mt-1">{errorMsg}</p>
                )}
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
                    Äang gá»­i yÃªu cáº§u...
                  </span>
                ) : (
                  'Gá»­i yÃªu cáº§u Ä‘áº·t láº¡i máº­t kháº©u'
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
          )}
        </div>
      </div>
    </div>
  );
}
