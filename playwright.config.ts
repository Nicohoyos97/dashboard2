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
// Pinned, and deliberately not UTC: a UTC-assuming render looks correct to both
// a UTC runner and a developer whose own zone happens to hide it, so nothing in
// the suite could see it. America/New_York is the firm's zone and has DST.
// Set on the spec process and on the dev server it starts, or the two disagree
// and every server-rendered timestamp looks like a hydration mismatch.
const TEST_TZ = 'America/New_York';
process.env.TZ = TEST_TZ;

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
  // These suites are the only tenant-isolation coverage in the repo, so a run
  // that goes red at random is worse than a slow one: it teaches people to
  // re-run, and then to ignore. Measured, on this machine, against the whole
  // suite:
  //   workers: 2, expect 10s          → 1 failure per run, moving between the
  //                                      heaviest specs, sometimes ECONNRESET
  //                                      from the dev server
  //   compiling every route up front  → no effect, so it is not first-request
  //                                      compilation
  //   workers: 1                      → worse (5 then 3 of 50): these files
  //                                      share fixture state across one worker
  //                                      process
  //   expect 20s                      → helped, still not deterministic
  // What is left is resource contention between the dev server, Docker
  // Supabase and two browsers, which no amount of test logic fixes. So: a
  // wider assertion budget, plus one retry. A retry does not hide anything
  // here — Playwright reports a test that needed one as `flaky`, its own
  // outcome, while a test that fails both attempts is still red.
  retries: 1,
  expect: { timeout: 20_000 },
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
        TZ: TEST_TZ,
        ...serverEnv,
        ...(nickE2E ? { ANTHROPIC_BASE_URL: ANTHROPIC_MOCK_URL } : {}),
      },
      ...(nickE2E ? { stdout: 'pipe' as const, stderr: 'pipe' as const } : {}),
    },
  ],
});
