'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { HiCheckCircle, HiExclamationCircle, HiMail, HiSparkles } from 'react-icons/hi';
import { authAPI } from '@/lib/api';

type VerifyStatus = 'loading' | 'success' | 'error';

export default function VerifyEmailPage() {
  const router = useRouter();
  const [status, setStatus] = useState<VerifyStatus>('loading');
  const [message, setMessage] = useState('Đang xác thực email...');
  const [email, setEmail] = useState('');
  const [resending, setResending] = useState(false);

  useEffect(() => {
    const verify = async () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');

      if (!token) {
        setStatus('error');
        setMessage('Link xác thực không hợp lệ hoặc đã hết hạn.');
        return;
      }

      try {
        const res = await authAPI.verifyEmail(token);
        if (res.data?.accessToken) {
          localStorage.setItem('accessToken', res.data.accessToken);
          localStorage.setItem('refreshToken', res.data.refreshToken);
        }
        setEmail(res.data?.user?.email || '');
        setStatus('success');
        setMessage(res.data?.message || 'Xác thực email thành công.');
        toast.success('Xác thực email thành công!');
        setTimeout(() => router.push(res.data?.accessToken ? '/' : '/login'), 1800);
      } catch (err: any) {
        setStatus('error');
        setMessage(err.response?.data?.message || 'Link xác thực không hợp lệ hoặc đã hết hạn.');
        toast.error('Không thể xác thực email.');
      }
    };

    verify();
  }, [router]);

  const handleResend = async () => {
    if (!email) {
      toast.error('Vui lòng quay lại trang đăng nhập và nhập email để gửi lại link xác thực.');
      return;
    }

    setResending(true);
    try {
      const res = await authAPI.resendVerificationEmail(email);
      toast.success(res.data?.message || 'Đã gửi lại email xác thực.');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể gửi lại email xác thực.');
    } finally {
      setResending(false);
    }
  };

  const isSuccess = status === 'success';
  const isLoading = status === 'loading';

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <HiSparkles className="text-5xl text-emerald-600 mx-auto mb-3" />
          <h1 className="text-3xl font-bold text-gray-900">
            Meal<span className="text-emerald-600">AI</span>
          </h1>
          <p className="text-gray-500 mt-2">Xác thực tài khoản email</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          {isLoading ? (
            <div className="mx-auto mb-5 h-12 w-12 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
          ) : isSuccess ? (
            <HiCheckCircle className="mx-auto mb-5 text-6xl text-emerald-600" />
          ) : (
            <HiExclamationCircle className="mx-auto mb-5 text-6xl text-red-500" />
          )}

          <h2 className="text-2xl font-bold text-gray-900">
            {isLoading ? 'Đang xác thực' : isSuccess ? 'Xác thực thành công' : 'Xác thực thất bại'}
          </h2>
          <p className="mt-3 text-gray-600">{message}</p>

          {isSuccess ? (
            <p className="mt-3 text-sm text-gray-500">MealAI sẽ tự chuyển bạn vào hệ thống sau vài giây.</p>
          ) : (
            <div className="mt-6 space-y-3">
              {email && (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  <HiMail />
                  {resending ? 'Đang gửi...' : 'Gửi lại email xác thực'}
                </button>
              )}
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center rounded-xl border border-gray-200 px-4 py-3 font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Quay lại đăng nhập
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
