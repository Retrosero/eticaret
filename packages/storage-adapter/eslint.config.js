/**
 * Storage adaptör ESLint yapılandırması (Node paketi).
 */
import { nodeConfig } from '@eticart/eslint-config/node.js';

export default [
  ...nodeConfig,
  {
    rules: {
      'no-console': 'off',
    },
  },
];
