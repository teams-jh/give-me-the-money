import type { NextConfig } from 'next';

const isStaticExport = true;

/** @type {import('next').NextConfig} */
const nextConfig: any = {
  trailingSlash: true,
  output: isStaticExport ? 'export' : undefined,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  assetPrefix: process.env.NEXT_PUBLIC_BASE_PATH || '',
  images: {
    unoptimized: true,
  },
  productionBrowserSourceMaps: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  env: {
    BUILD_STATIC_EXPORT: JSON.stringify(isStaticExport),
  },
  experimental: {
    cpus: 1,
    workerThreads: false,
    serverSourceMaps: false,
    optimizePackageImports: ['@mui/material', '@mui/icons-material', 'minimal-shared'],
  },
  webpack(config: any, { isServer }: { isServer: boolean }) {
    // SVG 처리
    config.module.rules.push({
      test: /\.svg$/,
      use: ['@svgr/webpack'],
    });

    // 클라이언트 번들만 최적화
    if (!isServer) {
      // icon-sets를 별도 청크로 분리하여 메인 번들 크기 감소
      const originalSplitChunks = config.optimization.splitChunks;
      config.optimization.splitChunks = {
        ...originalSplitChunks,
        cacheGroups: {
          ...(originalSplitChunks?.cacheGroups || {}),
          iconSets: {
            test: /[\\/]components[\\/]iconify[\\/]icon-sets/,
            name: 'icon-sets',
            chunks: 'all',
            priority: 30,
            reuseExistingChunk: true,
          },
        },
      };
      
      // 메모리 최적화: 빌드 시 메모리 사용량 감소를 위해 source-map 비활성화 및 최적화
      config.devtool = false;
    }

    return config;
  },
  turbopack: {
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },
};

export default nextConfig;
