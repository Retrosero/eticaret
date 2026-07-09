/**
 * @eticart/eslint-config/next
 * Next.js (App Router) için ek kurallar.
 */

import baseConfig from './index.js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...baseConfig,
  {
    files: ['**/*.{ts,tsx,jsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // Next.js App Router: server components default
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Erişilebilirlik (Türkçe site için elzem)
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/label-has-associated-control': 'error',
      'jsx-a11y/html-has-lang': 'error',
      'jsx-a11y/lang': 'error',

      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/no-unescaped-entities': 'off',

      // Next.js ortak desenler
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/server-only'],
              message: 'Sunucu-yalnız importu sadece Server Componentlerden kullanın.',
            },
          ],
        },
      ],
    },
  },
];
