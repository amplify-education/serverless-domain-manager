import eslint from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import pluginImport from "eslint-plugin-import";
import pluginN from "eslint-plugin-n";
import pluginPromise from "eslint-plugin-promise";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/**", "dist/**"]
  },
  eslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module"
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.commonjs,
        ...globals.mocha
      }
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "import": pluginImport,
      "n": pluginN,
      "promise": pluginPromise
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "quotes": ["error", "double"],
      "semi": ["error", "always"],
      "arrow-parens": ["error", "always"],
      "complexity": ["error", 15],
      "guard-for-in": "error",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_", "caughtErrors": "none" }],
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "no-undef": "off"
    }
  }
];
