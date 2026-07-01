'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { HiSparkles, HiMail } from 'react-icons/hi';
import { FaFacebook, FaGithub, FaInstagram } from 'react-icons/fa';
import ScrollReveal from '@/components/animations/ScrollReveal';

export default function Footer() {
  const pathname = usePathname();
  const { user, isAdmin } = useAuth();

  // Hide footer on Authentication and Admin routes
  const noFooterRoutes = ['/login', '/register', '/forgot-password', '/reset-password'];
  const isNoFooterRoute = noFooterRoutes.includes(pathname) || pathname.startsWith('/admin');

  if (isNoFooterRoute || isAdmin) {
    return null;
  }

  return user ? <DashboardFooter /> : <LandingFooter />;
}

/* ==================== 1. LANDING PAGE FOOTER (LIGHT THEME) ==================== */
function LandingFooter() {
  return (
    <ScrollReveal>
      <footer suppressHydrationWarning className="relative z-10 border-t border-slate-200 bg-slate-50 text-slate-600 text-sm">
        <div suppressHydrationWarning className="max-w-7xl mx-auto px-4 sm:px-6 py-16 grid grid-cols-1 md:grid-cols-12 gap-10">
        
        {/* Brand column */}
        <div suppressHydrationWarning className="md:col-span-4 space-y-4 text-left">
          <Link href="/" className="flex items-center gap-2 group">
            <HiSparkles className="text-2xl text-emerald-500 transition-transform group-hover:rotate-12 duration-300" />
            <span className="font-extrabold text-xl text-slate-900 tracking-tight">
              Meal<span className="bg-gradient-to-r from-brand-primary to-brand-secondary bg-clip-text text-transparent">AI</span>
            </span>
          </Link>
          <p className="text-xs text-slate-500 leading-relaxed font-medium max-w-sm">
            Hệ thống gợi ý thực đơn thông minh cho gia đình Việt tích hợp AI. Tối ưu hóa dinh dưỡng và giải quyết triệt để lãng phí thực phẩm.
          </p>
        </div>

        {/* Column 2: Features */}
        <div suppressHydrationWarning className="md:col-span-3 space-y-4 text-left">
          <h5 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Tính năng</h5>
          <ul className="space-y-2.5 text-xs font-semibold">
            <li>
              <Link href="/recipes" className="hover:text-brand-primary hover:translate-x-1 inline-block transition-all duration-200">
                Công thức
              </Link>
            </li>
            <li>
              <Link href="/meal-planner" className="hover:text-brand-primary hover:translate-x-1 inline-block transition-all duration-200">
                Thực đơn
              </Link>
            </li>
            <li>
              <Link href="/nutrition" className="hover:text-brand-primary hover:translate-x-1 inline-block transition-all duration-200">
                Dinh dưỡng & AI Insights
              </Link>
            </li>
            <li>
              <Link href="/shopping-list" className="hover:text-brand-primary hover:translate-x-1 inline-block transition-all duration-200">
                Mua sắm
              </Link>
            </li>
            <li>
              <Link href="/inventory" className="hover:text-brand-primary hover:translate-x-1 inline-block transition-all duration-200">
                Tủ lạnh
              </Link>
            </li>
          </ul>
        </div>

        {/* Column 3: Contact */}
        <div suppressHydrationWarning className="md:col-span-3 space-y-4 text-left">
          <h5 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Liên hệ</h5>
          <ul className="space-y-2.5 text-xs font-semibold">
            <li>
              <a href="mailto:nhuthoas04@gmail.com" className="flex items-center gap-2 hover:text-brand-primary hover:translate-x-1 inline-flex transition-all duration-200">
                <HiMail className="text-sm" /> nhuthoas04@gmail.com
              </a>
            </li>
            <li>
              <a href="https://github.com/nhuthoas04/tn-da22tta-nguyennhuthoa-meal-ai" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-brand-primary hover:translate-x-1 inline-flex transition-all duration-200">
                <FaGithub className="text-sm" /> nhuthoas04/tn-da22tta-nguyennhuthoa-meal-ai
              </a>
            </li>
            <li>
              <a href="https://www.facebook.com/nhathoa.nguyen.2711" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-brand-primary hover:translate-x-1 inline-flex transition-all duration-200">
                <FaFacebook className="text-sm" /> nhathoa.nguyen.2711
              </a>
            </li>
            <li>
              <a href="https://www.instagram.com/nhhoas_/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-brand-primary hover:translate-x-1 inline-flex transition-all duration-200">
                <FaInstagram className="text-sm" /> nhhoas_
              </a>
            </li>
          </ul>
        </div>

        {/* Column 4: Legal */}
        <div suppressHydrationWarning className="md:col-span-2 space-y-4 text-left">
          <h5 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Pháp lý</h5>
          <ul className="space-y-2.5 text-xs font-semibold">
            <li>
              <Link href="/privacy-policy" className="hover:text-brand-primary hover:translate-x-1 inline-block transition-all duration-200">
                Chính sách bảo mật
              </Link>
            </li>
            <li>
              <Link href="/terms-of-service" className="hover:text-brand-primary hover:translate-x-1 inline-block transition-all duration-200">
                Điều khoản sử dụng
              </Link>
            </li>
          </ul>
        </div>

      </div>

      {/* Footer Bottom */}
      <div className="border-t border-slate-200 bg-slate-100/60 py-6 text-xs text-slate-500 font-semibold">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row justify-between items-center gap-4 text-center sm:text-left">
          <p>© 2026 MealAI. Bảo lưu mọi quyền.</p>
          <p className="flex flex-wrap justify-center items-center gap-1.5 text-slate-500">
            Powered by <span className="bg-gradient-to-r from-brand-primary to-brand-secondary bg-clip-text text-transparent font-bold">Gemini AI</span>, Recommendation Engine & Anti-Waste Technology.
          </p>
        </div>
      </div>
      </footer>
    </ScrollReveal>
  );
}

/* ==================== 2. DASHBOARD FOOTER (LIGHT THEME) ==================== */
function DashboardFooter() {
  return (
    <footer className="border-t border-brand-light-border bg-white py-6 text-xs text-slate-500 font-bold w-full mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row justify-between items-center gap-4">
        
        {/* Left Side */}
        <div className="flex flex-wrap items-center justify-center md:justify-start gap-1.5 text-center md:text-left">
          <span className="text-slate-900 font-extrabold text-sm tracking-tight">
            Meal<span className="text-brand-primary">AI</span>
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-500 font-medium">Hệ thống gợi ý thực đơn thông minh cho gia đình Việt</span>
        </div>

        {/* Right Side */}
        <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-center sm:text-left font-medium">
          <div className="flex items-center gap-1.5 text-slate-500">
            <span>Powered by:</span>
            <span className="text-brand-primary font-bold">AI Recommendation</span>
            <span className="text-slate-350 font-normal">•</span>
            <span className="text-slate-700 font-bold">Anti-Waste</span>
            <span className="text-slate-350 font-normal">•</span>
            <span className="text-slate-700 font-bold">Meal Planner</span>
          </div>
          <span className="hidden sm:inline text-slate-300">|</span>
          <span className="text-slate-400 font-semibold">Version 1.0</span>
          <span className="hidden sm:inline text-slate-300">|</span>
          <span>© 2026 All Rights Reserved</span>
        </div>

      </div>
    </footer>
  );
}
