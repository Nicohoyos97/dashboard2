import path from 'node:path';

import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

// Security headers (CSP/HSTS/etc.) are wired in Phase 7 — see docs/SECURITY.md.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin the file-tracing root to this project so Next ignores unrelated
  // lockfiles higher up the filesystem (e.g. a stray ~/package-lock.json).
  outputFileTracingRoot: path.join(__dirname),
  // Local dev runs on 127.0.0.1 (see docs/ENVIRONMENTS.md); allow it explicitly
  // so Next doesn't warn about cross-origin /_next/* requests.
  allowedDevOrigins: ['127.0.0.1'],
};

export default withNextIntl(nextConfig);
