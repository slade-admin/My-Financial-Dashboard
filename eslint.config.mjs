import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // These patterns are unanchored so they also match nested copies.
    // `.fintech_ecosystem` is a linked git worktree holding another branch;
    // its build output alone accounted for ~3,000 of the ~3,100 problems
    // `npx eslint .` reported, drowning out the ~30 real ones in src/ and
    // scripts/. Linting another branch's checkout from here is wrong anyway.
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    ".fintech_ecosystem/**",
  ]),
  {
    rules: {
      // A leading underscore marks a binding that exists only to be discarded,
      // e.g. `const { password_hash: _ph, ...user } = row`, which strips the
      // hash before the row is returned to a caller. That is deliberate, so it
      // should not be reported as an unused variable.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
]);

export default eslintConfig;
