import js from "@eslint/js";
import ts from "typescript-eslint";
export default ts.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "src-tauri/**",
      "mobile/**",
      "supabase/**",
      "scripts/**",
      "src/*.ts",
      "src/*.tsx",
      "tests/print-layout.test.ts",
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["src/management/**/*.{ts,tsx}", "tests/management/**/*.ts"],
    languageOptions: {
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        location: "readonly",
        crypto: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        FormData: "readonly",
        Blob: "readonly",
        URL: "readonly",
        TextEncoder: "readonly",
        console: "readonly",
        fetch: "readonly",
        HTMLDialogElement: "readonly",
        HTMLElement: "readonly",
        HTMLFormElement: "readonly",
        KeyboardEvent: "readonly",
        React: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "no-undef": "off",
    },
  },
);
