import { readFileSync } from 'node:fs';

import { defineConfig, devices } from '@playwright/test';

// Load .env.local into the test process (Playwright doesn't do this on its own).
// The RLS test reads the local Supabase URL + keys from here, so we never hard
// code keys in the test file. The webServer (`pnpm dev`) loads its own copy.
try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && match[1] && !process.env[match[1]]) process.env[match[1]] = match[2] ?? '';
  }
} catch {
  // .env.local is optional in CI; tests that need it assert their own env.
}

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
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
