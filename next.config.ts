import path from 'node:path';

import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

// Security headers (docs/SECURITY.md → Headers). Every response carries them,
// including the API routes, so a JSON error page is as locked down as a page.
//
// Two deliberate omissions:
//   · Strict-Transport-Security — Vercel already sends it for the custom domain
//     (max-age=63072000); a second, differing header would be ambiguous.
//   · A resource CSP (script-src / style-src / connect-src). Next injects inline
//     scripts, so a real policy needs per-request nonces, and `pnpm dev` — what
//     the e2e suite runs against — needs 'unsafe-eval' that production must not
//     have. It cannot be verified from here, so it is a preview-deploy task;
//     `frame-ancestors` is the part that carries no such risk and it ships now.
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
  reactStrictMode: true,
  // A second dev server (Playwright) or a verification build must not write
  // into the .next of a running `pnpm dev`: the shared directory corrupts
  // both. Vercel and plain `pnpm dev` keep the default.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // Pin the file-tracing root to this project so Next ignores unrelated
  // lockfiles higher up the filesystem (e.g. a stray ~/package-lock.json).
  outputFileTracingRoot: path.join(__dirname),
  // Local dev runs on 127.0.0.1 (see docs/ENVIRONMENTS.md); allow it explicitly
  // so Next doesn't warn about cross-origin /_next/* requests.
  allowedDevOrigins: ['127.0.0.1'],
};

export default withNextIntl(nextConfig);
