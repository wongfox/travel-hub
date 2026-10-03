// @ts-check
import rootConfig from "../../eslint.config.js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

/**
 * `apps/web` extends the shared root config and adds the React-specific
 * plugins the root config's own comment reserves for framework packages
 * as they are scaffolded (see `eslint.config.js` at the repo root).
 */
export default [
  ...rootConfig,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
];
