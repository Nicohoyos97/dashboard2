// Loads the test environment (see tests/setup/load-env.ts) for the suites that
// talk to local Supabase.
import { loadTestEnv } from './load-env';

// Before anything constructs a Date: Node caches the zone on first use.
process.env.TZ = 'America/New_York';

loadTestEnv();
