import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    testTimeout: 30_000,
    setupFiles: ['./src/onboarding/__tests__/onboarding.test-setup.ts'],
    server: {
      deps: {
        external: ['axios', 'nodemailer'],
      },
    },
  },
  resolve: {
    extensions: ['.ts', '.js', '.mjs', '.json'],
    alias: {
      '@eticart/config': fileURLToPath(
        new URL('../../packages/config/src/index.ts', import.meta.url),
      ),
      '@eticart/shared-types': fileURLToPath(
        new URL('../../packages/shared-types/src/index.ts', import.meta.url),
      ),
      '@eticart/notification-adapters': fileURLToPath(
        new URL(
          '../../packages/notification-adapters/src/index.ts',
          import.meta.url,
        ),
      ),
    },
  },
});
