import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/library/shared/**/*.test.ts',
      'scripts/**/*.test.ts',
      'server_node/scripts/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      // 커버리지 측정 대상: 백엔드 담당 3개 디렉토리의 소스 파일 전체
      include: [
        'src/library/shared/**/*.ts',
        'scripts/**/*.ts',
        'server_node/scripts/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
      ],
      reporter: ['text', 'lcov'],
      // 파일별 80% 임계값 — 테스트 미작성 파일은 당연히 미달, 추후 테스트 추가로 해소
      perFile: true,
      thresholds: {
        lines:      80,
        functions:  80,
        branches:   80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
