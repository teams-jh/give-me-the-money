import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/library/shared/**/*.ts'],
      exclude: ['src/library/shared/**/*.test.ts'],
      reporter: ['text', 'lcov'],
      thresholds: {
        lines:     80,
        functions: 80,
        branches:  70,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
