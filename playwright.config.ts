import { defineConfig, devices } from '@playwright/test';

import { loadTestEnv } from './tests/setup/load-env';

// Environment for the run (Playwright doesn't load .env itself). `.env.test.local`
// wins over `.env.local` so the suite always drives local Supabase, whatever the
// app's dev config currently points at — these specs delete users and businesses.
const testEnv = loadTestEnv();
const SUPABASE_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_APP_URL',
  'APP_URL',
] as const;
// Passed to the dev server we start: a real environment variable beats a .env
// file in Next, so the server under test reads the same database as the specs.
const serverEnv = Object.fromEntries(
  SUPABASE_KEYS.flatMap((key) => {
    const value = process.env[key] ?? testEnv[key];
    return value ? [[key, value] as [string, string]] : [];
  }),
);

// NICK_E2E=1 also boots the mocked Messages API and points the dev server at
// it (tests/e2e/nick.spec.ts). An already-running dev server cannot be reused
// then: it would talk to the real API.
const nickE2E = process.env.NICK_E2E === '1';
const ANTHROPIC_MOCK_URL = 'http://127.0.0.1:4010';
// PLAYWRIGHT_PORT lets a run boot its own dev server beside one already on 3000.
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const BASE_URL = `http://localhost:${PORT}`;

// Boots `pnpm dev` for the run. Phase 1+ RLS/auth flows live alongside this.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // A single Next dev server and local Supabase stack back the suite. More
  // workers can strand a Server Action during concurrent first-time route
  // compilation, so cap concurrency for a deterministic auth signal.
  workers: 2,
  // Several specs drive TOTP enrolment, Mailpit round-trips and server actions
  // through one dev server at once; give each test room beyond the defaults.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    // Single dev origin = localhost (Next/next-intl force it in dev) — see
    // docs/ENVIRONMENTS.md. Using 127.0.0.1 here would make every navigation
    // bounce to localhost mid-test.
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    ...(nickE2E
      ? [
          {
            command:
              'node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/e2e/helpers/anthropic-mock-server.ts',
            url: `${ANTHROPIC_MOCK_URL}/health`,
            reuseExistingServer: false,
            timeout: 30_000,
            stdout: 'pipe' as const,
          },
        ]
      : []),
    {
      command: `pnpm dev -p ${PORT}`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI && !nickE2E,
      timeout: 120_000,
      // Own build output, so a server started here never shares .next with the developer's.
      env: {
        NEXT_DIST_DIR: '.next-e2e',
        ...serverEnv,
        ...(nickE2E ? { ANTHROPIC_BASE_URL: ANTHROPIC_MOCK_URL } : {}),
      },
      ...(nickE2E ? { stdout: 'pipe' as const, stderr: 'pipe' as const } : {}),
    },
  ],
});
