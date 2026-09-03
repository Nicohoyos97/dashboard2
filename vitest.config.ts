import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Mirror the tsconfig `@/*` path alias so unit tests can import app code.
const rootDir = resolve(fileURLToPath(new URL('.', import.meta.url)));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': rootDir,
      // Node-side tests import server modules directly (see tests/stubs).
      'server-only': resolve(rootDir, 'tests/stubs/server-only.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/integration/**/*.test.ts'],
    setupFiles: ['tests/setup/env.ts'],
    // Integration tests run the real worker against local Supabase (Anthropic mocked).
    testTimeout: 60_000,
  },
});
