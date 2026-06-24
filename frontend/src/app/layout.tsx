import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import ClientLayout from './client-layout';

const inter = Inter({ subsets: ['latin', 'vietnamese'] });

export const metadata: Metadata = {
  title: 'MealAI - Lên kế hoạch bữa ăn thông minh',
  description: 'Hệ thống gợi ý thực đơn và lên kế hoạch bữa ăn cho gia đình Việt Nam sử dụng AI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                function cleanInjectedAttrs(root) {
                  if (!root || !root.querySelectorAll) return;
                  if (root.removeAttribute) root.removeAttribute('bis_skin_checked');
                  root.querySelectorAll('[bis_skin_checked]').forEach(function (node) {
                    node.removeAttribute('bis_skin_checked');
                  });
                }
                cleanInjectedAttrs(document.documentElement);
                var observer = new MutationObserver(function (mutations) {
                  mutations.forEach(function (mutation) {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'bis_skin_checked') {
                      mutation.target.removeAttribute('bis_skin_checked');
                    }
                    mutation.addedNodes && mutation.addedNodes.forEach(function (node) {
                      cleanInjectedAttrs(node);
                    });
                  });
                });
                observer.observe(document.documentElement, {
                  attributes: true,
                  attributeFilter: ['bis_skin_checked'],
                  childList: true,
                  subtree: true
                });
                window.__mealAiHydrationCleanup = observer;
                window.addEventListener('load', function () {
                  setTimeout(function () {
                    cleanInjectedAttrs(document.documentElement);
                    if (window.__mealAiHydrationCleanup) {
                      window.__mealAiHydrationCleanup.disconnect();
                      delete window.__mealAiHydrationCleanup;
                    }
                  }, 3000);
                });
              })();
            `,
          }}
        />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
