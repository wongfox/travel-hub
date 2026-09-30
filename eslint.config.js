// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

/**
 * Root ESLint flat config shared by every workspace package.
 * Individual packages/apps/services extend this file and add their
 * own framework-specific plugins (React, Fastify, etc.) as they are
 * scaffolded in later work units.
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/.output/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
);
