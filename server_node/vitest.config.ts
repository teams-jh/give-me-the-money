import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment:  "node",
    include:      ["scripts/__tests__/**/*.test.ts"],
    globals:      true,
    coverage: {
      provider: "v8",
      include:  ["scripts/**/*.ts"],
      exclude:  ["scripts/__tests__/**"],
      reporter: ["text", "lcov", "html"],
    },
  },
});
