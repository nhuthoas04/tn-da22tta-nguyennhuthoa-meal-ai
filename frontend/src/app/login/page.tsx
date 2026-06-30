'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { HiMail, HiSparkles } from 'react-icons/hi';
import { API_BASE_URL, authAPI } from '@/lib/api';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const emailFromQuery = params.get('email');
    if (emailFromQuery) setEmail(emailFromQuery);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLoginError('');
    setNeedsVerification(false);
    try {
      await login(email, password);
      toast.success('Đăng nhập thành công!');
      router.push('/');
    } catch (err: any) {
      let message = '';
      const status = err.response?.status;
      const code = err.response?.data?.code;
      if (code === 'EMAIL_NOT_VERIFIED') {
        message =
          err.response?.data?.message ||
          'Tài khoản chưa xác thực email. Vui lòng kiểm tra Gmail để xác nhận tài khoản.';
        setNeedsVerification(true);
      } else if (err.code === 'ERR_NETWORK' || !err.response) {
        message = 'Không kết nối được backend. Vui lòng kiểm tra backend đang chạy ở http://localhost:3001.';
      } else if (status === 401) {
        message = 'Email hoặc mật khẩu không đúng.';
      } else if (status === 404) {
        message = 'Sai endpoint API đăng nhập. Kiểm tra cấu hình NEXT_PUBLIC_API_URL hoặc AuthController.';
      } else if (status >= 500) {
        message = 'Lỗi máy chủ. Vui lòng kiểm tra backend hoặc PostgreSQL.';
      } else {
        message = err.response?.data?.message || 'Email hoặc mật khẩu không đúng.';
      }
      setLoginError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email) {
      toast.error('Vui lòng nhập email trước khi gửi lại link xác thực.');
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

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <HiSparkles className="text-5xl text-emerald-600 mx-auto mb-3" />
          <h1 className="text-3xl font-bold text-gray-900">
            Meal<span className="text-emerald-600">AI</span>
          </h1>
          <p className="text-gray-500 mt-2">Đăng nhập để quản lý thực đơn</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
              placeholder="example@email.com"
            />
          </div>
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-gray-700">Mật khẩu</label>
              <Link href="/forgot-password" className="text-xs text-emerald-600 font-medium hover:underline">
                Quên mật khẩu?
              </Link>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
              placeholder="Nhập mật khẩu"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition disabled:opacity-50"
          >
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>

          {loginError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <p className="font-semibold">{loginError}</p>
              {needsVerification && (
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={resending}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200 transition hover:bg-emerald-50 disabled:opacity-50"
                >
                  <HiMail />
                  {resending ? 'Đang gửi...' : 'Gửi lại email xác thực'}
                </button>
              )}
              <p className="mt-2 text-xs text-red-600">
                URL đang gọi: {API_BASE_URL}/auth/login
              </p>
            </div>
          )}

          <p className="text-center text-sm text-gray-500">
            Chưa có tài khoản?{' '}
            <Link href="/register" className="text-emerald-600 font-medium hover:underline">
              Đăng ký
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
