import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

/** Browser globals the spike uses. Declared explicitly rather than pulling in
 *  the `globals` package for one directory. */
const browserGlobals = {
  AbortController: "readonly",
  AbortSignal: "readonly",
  CustomEvent: "readonly",
  Event: "readonly",
  URL: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
  document: "readonly",
  location: "readonly",
  navigator: "readonly",
  performance: "readonly",
  setTimeout: "readonly",
  window: "readonly",
};

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/.wrangler/**", "**/node_modules/**", "**/*.d.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Match tsc's noUnusedParameters, which already ignores the _ prefix.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // The spike is dependency-free plain JavaScript served straight to a
    // browser, so it gets browser globals and no TypeScript-flavoured rules.
    files: ["apps/spike/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: browserGlobals,
    },
  },
  prettier,
);
