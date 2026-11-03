import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  { ignores: ["dist/", "build/", "coverage/", "node_modules/", "*.min.js"] },
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { project: "./tsconfig.json" },
      globals: {
        // Browser globals
        document: "readonly",
        window: "readonly",
        console: "readonly",
        fetch: "readonly",
        alert: "readonly",
        setTimeout: "readonly",
        URL: "readonly",
        Blob: "readonly",
        location: "readonly",
        history: "readonly",
        navigator: "readonly",
        HTMLFormElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLButtonElement: "readonly",
      },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": "error",
    },
  },
  {
    // Scripts are plain ESM tooling that legitimately talks to the console.
    files: ["scripts/**/*.mjs", "scripts/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
    rules: {
      ...js.configs.recommended.rules,
    },
  },
];
