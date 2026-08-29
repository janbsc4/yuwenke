import eslint from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", ".astro/**", "node_modules/**", "public/**"],
  },
  eslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // The dataset is parsed at runtime from CSV/JSON files, so index access
      // guards are intentional even when index signatures hide undefined.
      "@typescript-eslint/no-unnecessary-condition": "off",
      // Row numbers and counts legitimately appear in messages and labels.
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
      },
    },
  },
  {
    files: ["tests/**/*.ts", "tests/**/*.tsx"],
    rules: {
      // Test fixtures rely on non-null assertions after find().
      "@typescript-eslint/no-non-null-assertion": "off",
      // expect(() => ...).toThrow() and void-returning mocks are idiomatic.
      "@typescript-eslint/no-confusing-void-expression": "off",
      // Mock implementations mirror async Firebase signatures without awaiting.
      "@typescript-eslint/require-await": "off",
      // Untyped mock boundary objects for the Firebase SDK.
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },
);
