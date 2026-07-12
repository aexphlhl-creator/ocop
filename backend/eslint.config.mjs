// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import securityPlugin from 'eslint-plugin-security';
import noUnsanitized from 'eslint-plugin-no-unsanitized';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  securityPlugin.configs.recommended,
  noUnsanitized.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      "prettier/prettier": ["error", { endOfLine: "auto" }],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-restricted-syntax": [
        "error",
        {
          "selector": "CallExpression[callee.object.name='child_process'][callee.property.name='exec']",
          "message": "child_process.exec is not allowed due to security risks. Use child_process.execFile instead."
        }
      ],
      "no-restricted-properties": [
        "error",
        {
          "property": "innerHTML",
          "message": "innerHTML is not allowed. Use textContent instead."
        },
        {
          "property": "dangerouslySetInnerHTML",
          "message": "dangerouslySetInnerHTML is not allowed."
        }
      ]
    },
  },
);
