// Loads .env.local into process.env for tests that talk to local Supabase.
// Existing variables win, so CI can inject its own values.
import { readFileSync } from 'node:fs';

try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && match[1] && !process.env[match[1]]) process.env[match[1]] = match[2] ?? '';
  }
} catch {
  // Optional: unit tests never need it.
}
