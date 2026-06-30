'use client';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { HiCheckCircle, HiSparkles } from 'react-icons/hi';

export default function RegisterPage() {
  const { register } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(email, password, fullName);
      setRegisteredEmail(email);
      toast.success('Đăng ký thành công. Vui lòng kiểm tra email để xác thực tài khoản.');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Đăng ký thất bại. Email có thể đã tồn tại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <HiSparkles className="text-5xl text-emerald-600 mx-auto mb-3" />
          <h1 className="text-3xl font-bold text-gray-900">Tạo tài khoản</h1>
          <p className="text-gray-500 mt-2">Bắt đầu lên kế hoạch bữa ăn</p>
        </div>

        {registeredEmail ? (
          <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 p-8 text-center">
            <HiCheckCircle className="text-6xl text-emerald-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900">Kiểm tra email của bạn</h2>
            <p className="mt-3 text-gray-600">
              MealAI đã gửi link xác thực đến <strong>{registeredEmail}</strong>.
              Vui lòng mở Gmail và bấm vào link xác thực để kích hoạt tài khoản.
            </p>
            <p className="mt-3 text-sm text-gray-500">
              Link xác thực có hiệu lực trong 24 giờ. Nếu không thấy email, hãy kiểm tra thư rác.
            </p>
            <Link
              href={`/login?email=${encodeURIComponent(registeredEmail)}`}
              className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 font-medium text-white transition hover:bg-emerald-700"
            >
              Quay lại đăng nhập
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Họ tên</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
                placeholder="Nguyễn Văn A"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
                placeholder="Tối thiểu 6 ký tự"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {loading ? 'Đang tạo...' : 'Đăng ký'}
            </button>

            <p className="text-center text-sm text-gray-500">
              Đã có tài khoản?{' '}
              <Link href="/login" className="text-emerald-600 font-medium hover:underline">
                Đăng nhập
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
