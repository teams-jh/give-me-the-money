import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      // 테스트가 작성된 파일만 커버리지 측정
      // 새 파일 테스트 추가 시 include와 thresholds에 함께 추가할 것
      include: [
        'src/library/shared/indicators.ts',
        'src/library/shared/position.ts',
      ],
      exclude: ['src/library/shared/**/*.test.ts'],
      reporter: ['text', 'lcov'],
      thresholds: {
        // position.ts — 순수 계산 함수, 높은 커버리지 유지
        'src/library/shared/position.ts': {
          lines: 95, functions: 100, branches: 90,
        },
        // indicators.ts — SupportResistance/Trendlines 등 복잡한 분석 함수 포함
        // 핵심 지표(MA,EMA,RSI,MACD,BB,ATR,OBV,MDD,Stochastic,ADX,ROC,MFI,Supertrend,Envelope,Donchian) 커버
        'src/library/shared/indicators.ts': {
          lines: 45, functions: 65, branches: 38,
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
