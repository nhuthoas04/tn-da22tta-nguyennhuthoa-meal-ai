'use client';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Toaster } from 'react-hot-toast';
import ChatWidget from '@/components/ChatWidget';
import VoiceAssistantButton from '@/components/VoiceAssistantButton';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading) {
      const isPublicPath = ['/', '/login', '/register', '/forgot-password', '/reset-password'].includes(pathname);
      if (!isPublicPath && !user) {
        router.push('/login');
      }
    }
  }, [user, loading, pathname, router]);

  const isPublicPath = ['/', '/login', '/register', '/forgot-password', '/reset-password'].includes(pathname);

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
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className={`flex-grow ${isLandingPage ? "" : "max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full"}`}>
        <AuthGuard>{children}</AuthGuard>
      </main>
      <Footer />
      {user && <ChatWidget />}
      {user && <VoiceAssistantButton />}
      <Toaster position="top-right" />
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
