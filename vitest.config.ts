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
    // Pinned, and deliberately not UTC. A developer in Bogotá and a UTC runner
    // both render a UTC-assuming component "consistently wrong", so nothing in
    // the suite could see it. America/New_York is the firm's own zone and has
    // DST, so a date resolved in the wrong calendar shows up as a failure.
    env: { TZ: 'America/New_York' },
    // Integration tests run the real worker against local Supabase (Anthropic mocked).
    testTimeout: 60_000,
  },
});
