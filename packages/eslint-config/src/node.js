/**
 * @eticart/eslint-config/node
 * Node.js (NestJS, Medusa, scripts) için ek kurallar.
 */

import baseConfig from './index.js';
import globals from 'globals';

const nodeGlobals = {
  ...globals.node,
  ...globals.es2022,
};

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...baseConfig,
  {
    files: ['**/*.{ts,tsx,js,cjs,mjs}'],
    languageOptions: {
      globals: nodeGlobals,
    },
    rules: {
      // Konsola izin ver (logger abstraction kullanılıyor)
      'no-console': 'off',
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
];
