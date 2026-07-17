/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  build: { target: "ES2022" },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
