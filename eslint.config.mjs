import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["out/**", "node_modules/**", "tools/**", "*.vsix", "site/**"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "no-empty": ["error", { allowEmptyCatch: false }],
      eqeqeq: ["error", "always"]
    }
  },
  {
    files: ["samples/scripts/**/*.js"],
    languageOptions: { sourceType: "commonjs", globals: { module: "writable", exports: "writable", require: "readonly" } }
  },
  {
    files: ["**/*.mjs", "scripts/**/*.js"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        WebSocket: "readonly",
        fetch: "readonly",
        setTimeout: "readonly"
      }
    }
  }
);
