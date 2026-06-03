import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

// typescript-eslint flat config API (S1874: legacy overload still required by this package version)
export default tseslint.config( // NOSONAR
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/prefer-optional-chain": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "warn",
    },
  },
  {
    ignores: ["dist/**", "node_modules/**", "prisma/migrations/**"],
  },
);
