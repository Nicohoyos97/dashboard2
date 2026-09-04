import { readFileSync } from 'node:fs';

/**
 * Environment for the test suites. `.env.test.local` wins over `.env.local`
 * because `.env.local` is the *app's* dev config and may legitimately point at
 * the cloud project while someone verifies production — while these suites
 * create and delete users, businesses and storage objects with the service
 * role. Already-set variables always win, so CI can inject its own.
 *
 * Returns the variables it applied, so a caller (Playwright's webServer) can
 * hand the same values to the dev server it starts: real environment variables
 * take precedence over .env files in Next.js, so the server under test follows
 * the suite rather than whatever .env.local happens to say.
 */
export function loadTestEnv(): Record<string, string> {
  const applied: Record<string, string> = {};
  for (const file of ['.env.test.local', '.env.local']) {
    let contents: string;
    try {
      contents = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const line of contents.split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match || !match[1]) continue;
      const [, name, value = ''] = match;
      if (applied[name] !== undefined) continue;
      applied[name] = value;
      if (!process.env[name]) process.env[name] = value;
    }
    // The first file that exists is authoritative; falling through would let
    // .env.local supply the service-role key that .env.test.local omitted.
    break;
  }
  return applied;
}
