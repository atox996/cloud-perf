import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintPluginVue from "eslint-plugin-vue";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const autoImports = require("./packages/client/.eslintrc-auto-import.json");

export default tseslint.config(
  {
    ignores: ["**/dist/**", "/assets"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...eslintPluginVue.configs["flat/recommended"],
  {
    files: ["*.vue", "**/*.vue"],
    languageOptions: {
      globals: autoImports.globals,
      parserOptions: {
        parser: "@typescript-eslint/parser",
      },
    },
    rules: {
      "vue/multi-word-component-names": "off",
    },
  },
  /**
   * @see https://github.com/prettier/eslint-plugin-prettier?tab=readme-ov-file#configuration-new-eslintconfigjs
   * @description Must be in the last item
   */
  eslintPluginPrettierRecommended,
);
