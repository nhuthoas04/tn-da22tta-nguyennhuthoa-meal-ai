'use client';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Toaster } from 'react-hot-toast';
import ChatWidget from '@/components/ChatWidget';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

const publicPaths = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/privacy-policy',
  '/terms-of-service',
];

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading) {
      const isPublicPath = publicPaths.includes(pathname);
      if (!isPublicPath && !user) {
        router.push('/login');
      }
    }
  }, [user, loading, pathname, router]);

  const isPublicPath = publicPaths.includes(pathname);

  if (loading || (!isPublicPath && !user)) {
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
  const { user } = useAuth();

  return (
    <div className="flex flex-col min-h-screen" suppressHydrationWarning>
      <Navbar />
      <main className={`flex-grow ${isLandingPage ? "" : "max-w-7xl mx-auto px-3 py-4 w-full sm:px-6 sm:py-6"}`}>
        <AuthGuard>{children}</AuthGuard>
      </main>
      <Footer />
      <div suppressHydrationWarning>
        {user && <ChatWidget />}
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
