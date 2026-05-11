import 'src/global.css';

import type { Metadata, Viewport } from 'next';

import InitColorSchemeScript from '@mui/material/InitColorSchemeScript';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';

import { CONFIG } from 'src/global-config';
import { themeConfig, ThemeProvider } from 'src/theme';

import { Snackbar } from 'src/components/snackbar';
import { ProgressBar } from 'src/components/progress-bar';

// ----------------------------------------------------------------------

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export const metadata: Metadata = {
  title: 'AL is well',
  description: 'AL is well PWA Application',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'AL is well',
  },
  formatDetection: {
    telephone: false,
  },
  icons: [
    {
      rel: 'icon',
      url: `${CONFIG.assetsDir}/favicon.ico`,
    },
    {
      rel: 'apple-touch-icon',
      url: `${CONFIG.assetsDir}/logo/logo-single.png`,
    },
  ],
};

// ----------------------------------------------------------------------

type RootLayoutProps = {
  children: React.ReactNode;
};

export default async function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0, viewport-fit=cover" />
        {/* Force unregister any existing service workers to fix OOM issues from previous next-pwa installs */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // 기존 service worker 및 캐시 전체 해제 (OOM 방지)
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                  for(let registration of registrations) {
                    registration.unregister();
                  }
                });
              }
              // 오래된 캐시 삭제 (누적된 캐시가 OOM 원인이 될 수 있음)
              if ('caches' in window) {
                caches.keys().then(function(cacheNames) {
                  cacheNames.forEach(function(cacheName) {
                    caches.delete(cacheName);
                  });
                });
              }

              window.addEventListener('beforeinstallprompt', (e) => {
                const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                if (!isMobile) {
                  e.preventDefault();
                }
              });

              // 모바일 환경에서만 manifest를 로드하여 PC(크롬) 주소창의 설치 버튼을 원천 차단합니다.
              const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
              if (isMobile) {
                const link = document.createElement('link');
                link.rel = 'manifest';
                link.href = '${CONFIG.assetsDir}/manifest.json';
                document.head.appendChild(link);
              }
            `,
          }}
        />
      </head>
      <body>
        <InitColorSchemeScript
          modeStorageKey={themeConfig.modeStorageKey}
          attribute={themeConfig.cssVariables.colorSchemeSelector}
          defaultMode={themeConfig.defaultMode}
        />

        <AppRouterCacheProvider options={{ key: 'css' }}>
          <ThemeProvider
            modeStorageKey={themeConfig.modeStorageKey}
            defaultMode={themeConfig.defaultMode}
          >
            <Snackbar />
            <ProgressBar />
            {children}
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
