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
        crypto: "readonly",
        MessageChannel: "readonly",
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
    // HTML sinks bypass the textContent/createElement rendering discipline. The
    // CSP's 'unsafe-inline' exists only for the sandboxed viewer (see index.html).
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          property: "innerHTML",
          message:
            "Render with textContent/createElement; 'unsafe-inline' in index.html is only for the sandboxed viewer.",
        },
        {
          property: "outerHTML",
          message:
            "Render with textContent/createElement; 'unsafe-inline' in index.html is only for the sandboxed viewer.",
        },
        {
          property: "insertAdjacentHTML",
          message:
            "Render with textContent/createElement; 'unsafe-inline' in index.html is only for the sandboxed viewer.",
        },
        {
          property: "srcdoc",
          message:
            "Never inject HTML into iframes; 'unsafe-inline' in index.html is only for the sandboxed viewer.",
        },
        {
          object: "document",
          property: "write",
          message: "document.write is forbidden; see the CSP rationale in index.html.",
        },
        {
          object: "document",
          property: "writeln",
          message:
            "document.writeln is forbidden; see the CSP rationale in index.html.",
        },
      ],
    },
  },
  {
    // The core lane is pure processing and must stay DOM-free.
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "document", message: "src/core must not touch the DOM." },
        { name: "window", message: "src/core must not touch the DOM." },
        { name: "location", message: "src/core must not touch the DOM." },
        { name: "history", message: "src/core must not touch the DOM." },
        { name: "navigator", message: "src/core must not touch browser APIs." },
        { name: "alert", message: "src/core must not touch the DOM." },
        { name: "HTMLElement", message: "src/core must not use DOM types." },
        { name: "HTMLInputElement", message: "src/core must not use DOM types." },
        { name: "HTMLButtonElement", message: "src/core must not use DOM types." },
        { name: "HTMLFormElement", message: "src/core must not use DOM types." },
        { name: "Element", message: "src/core must not use DOM types." },
        { name: "Document", message: "src/core must not use DOM types." },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/ui/**"],
              message: "src/core must not import from src/ui.",
            },
          ],
        },
      ],
    },
  },
  {
    // The download service worker is plain JS served as-is from public/.
    files: ["public/sw.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        self: "readonly",
        clients: "readonly",
        Response: "readonly",
        Headers: "readonly",
        ReadableStream: "readonly",
        URL: "readonly",
      },
    },
    rules: {
      ...js.configs.recommended.rules,
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
