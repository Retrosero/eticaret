/**
 * @eticart/eslint-config/nestjs
 * NestJS projeleri için ek kurallar.
 */

import baseConfig from './node.js';

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...baseConfig,
  {
    files: ['**/*.controller.ts', '**/*.service.ts', '**/*.module.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];
