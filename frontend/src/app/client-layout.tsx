'use client';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Toaster } from 'react-hot-toast';
import ChatWidget from '@/components/ChatWidget';
import { healthAPI } from '@/lib/api';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

const publicPaths = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/privacy-policy',
  '/terms-of-service',
];

const authOnlyPaths = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
];

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;

    const isPublicPath = publicPaths.includes(pathname);
    const isAdminPath = pathname.startsWith('/admin');
    const isLegalPath =
      pathname === '/privacy-policy' || pathname === '/terms-of-service';

    if (!user && !isPublicPath) {
      router.replace('/login');
      return;
    }

    if (user?.role === 'admin' && !isAdminPath && !isLegalPath) {
      router.replace('/admin');
      return;
    }

    if (user && user.role !== 'admin' && authOnlyPaths.includes(pathname)) {
      router.replace('/');
      return;
    }

    if (user && user.role !== 'admin' && isAdminPath) {
      router.replace('/');
    }
  }, [user, loading, pathname, router]);

  const isPublicPath = publicPaths.includes(pathname);
  const isAdminPath = pathname.startsWith('/admin');
  const isLegalPath =
    pathname === '/privacy-policy' || pathname === '/terms-of-service';
  const isRoleRedirect =
    (user?.role === 'admin' && !isAdminPath && !isLegalPath) ||
    (Boolean(user) &&
      user?.role !== 'admin' &&
      authOnlyPaths.includes(pathname)) ||
    (Boolean(user) && user?.role !== 'admin' && isAdminPath);

  if (loading || (!isPublicPath && !user) || isRoleRedirect) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] py-12">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}

function AppContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLandingPage = pathname === '/';
  const { user, isAdmin } = useAuth();

  useEffect(() => {
    const warmupKey = 'mealai-backend-warmed-at';
    const lastWarmup = Number(sessionStorage.getItem(warmupKey) || 0);

    if (Date.now() - lastWarmup < 10 * 60 * 1000) return;

    void healthAPI
      .wake()
      .then(() => sessionStorage.setItem(warmupKey, String(Date.now())))
      .catch(() => sessionStorage.removeItem(warmupKey));
  }, []);

  return (
    <div className="flex flex-col min-h-screen" suppressHydrationWarning>
      <Navbar />
      <main className={`flex-grow ${isLandingPage ? "" : "max-w-7xl mx-auto px-3 py-4 w-full sm:px-6 sm:py-6"}`}>
        <AuthGuard>{children}</AuthGuard>
      </main>
      <Footer />
      <div suppressHydrationWarning>
        {user && !isAdmin && <ChatWidget />}
        <Toaster position="top-right" />
      </div>
    </div>
  );
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppContent>{children}</AppContent>
    </AuthProvider>
  );
}
