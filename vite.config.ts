/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  build: { target: "ES2022" },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // src/main.ts and src/ui are DOM wiring; only pure core logic is measured.
      include: ["src/core/**/*.ts"],
      reporter: ["text", "text-summary"],
      // Core lane coverage target (lines/functions/branches/statements).
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
