// Client-bundle guardrail. Run it after `next build`:
//
//   pnpm check:bundles                 # reads .next
//   NEXT_DIST_DIR=.next-prod pnpm check:bundles
//
// Two rules, both of which have already been broken once:
//
//  1. Containment. Recharts is ~96 kB gzipped and is loaded on demand by the
//     four components in components/charts. It must never reappear in a route's
//     initial JavaScript. It came back once because a wrapper imported a colour
//     constant from the plot module as a value, which is invisible in review and
//     silently undid the split.
//
//  2. Budget. Every route has a gzipped first-load ceiling. The numbers below
//     are the measured sizes plus headroom, so ordinary growth passes and a
//     regression of a whole library does not. Raising one is a deliberate edit
//     to this file, which is the point.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

/**
 * Text that must stay out of every route's initial JavaScript, by library.
 * `supabase-js` is the client's own X-Client-Info string, which survives
 * minification: the browser client is loaded on demand
 * (lib/supabase/browser-client.ts), and a static import of it put ~63 kB on
 * the profile, invite, MFA and upload pages.
 */
const MUST_BE_LAZY = ['recharts', 'supabase-js'];

/**
 * Gzipped first-load ceilings in kB, by route as the build manifest names it.
 * Re-measured on 2026-10-19 once the check counted the layouts above each page
 * (see analyzeBundles) — the figures before that left out the whole app shell —
 * and after the phase-4 cuts: measured size plus ~10 kB. The routes that lost
 * the most sit closest to their ceiling, so the loss cannot quietly come back.
 */
const BUDGETS = {
  '/[locale]/(dashboard)/expenses/page': 193,
  '/[locale]/(dashboard)/statements/profit-and-loss/page': 192,
  '/[locale]/(dashboard)/statements/balance-sheet/page': 192,
  '/[locale]/(dashboard)/dashboard/page': 187,
  '/[locale]/admin/(gated)/documents/[id]/page': 180,
  '/[locale]/admin/(gated)/entities/[id]/page': 178,
  '/[locale]/admin/(gated)/clients/[id]/page': 177,
  '/[locale]/(dashboard)/taxes/sales/page': 168,
  '/[locale]/(dashboard)/chat/page': 167,
  '/[locale]/(dashboard)/taxes/income/page': 166,
  '/[locale]/(dashboard)/settings/profile/page': 162,
  '/[locale]/admin/(gated)/upload/page': 161,
  '/[locale]/(dashboard)/reports/page': 157,
  // Sign-in is the first page of every session: zod and its resolver (~18 kB)
  // came off it with lib/auth/rules.ts, and this is what keeps them off.
  '/[locale]/(auth)/signin/page': 150,
  '/[locale]/(auth)/invite/page': 150,
  '/[locale]/admin/mfa/page': 125,
};

/**
 * Anything without its own entry. Keeps new routes honest without listing them
 * all. Since the shell's menus load on demand (components/shell/lazy-menus.tsx)
 * a page with no popper of its own sits near 150 kB.
 */
const DEFAULT_BUDGET = 165;

const KB = 1024;

export function analyzeBundles(distDir) {
  const manifestPath = path.join(distDir, 'app-build-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No build found at ${distDir}. Run \`next build\` first.`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const gzipped = new Map();
  const contents = new Map();

  const sizeOf = (file) => {
    if (!gzipped.has(file)) {
      gzipped.set(file, zlib.gzipSync(fs.readFileSync(path.join(distDir, file))).length);
    }
    return gzipped.get(file);
  };
  const textOf = (file) => {
    if (!contents.has(file)) {
      contents.set(file, fs.readFileSync(path.join(distDir, file), 'utf8'));
    }
    return contents.get(file);
  };

  const routes = [];
  for (const [route, files] of Object.entries(manifest.pages)) {
    if (!route.endsWith('/page')) continue;
    // A visitor downloads the page's chunks and every layout's above it. The
    // manifest lists the layouts under their own keys, and counting the page
    // entry alone left out the whole app shell: /help measured 101 kB here
    // and 177 kB in the browser, and the leak check never looked at a layout.
    const segments = route.split('/').slice(0, -1);
    const layouts = segments.map((_, index) => `${segments.slice(0, index + 1).join('/') || ''}/layout`);
    const js = [...new Set([...files, ...layouts.flatMap((layout) => manifest.pages[layout] ?? [])])].filter((file) => file.endsWith('.js'));
    const bytes = js.reduce((total, file) => total + sizeOf(file), 0);
    const budget = BUDGETS[route] ?? DEFAULT_BUDGET;
    const leaked = MUST_BE_LAZY.flatMap((module) => {
      const found = js.filter((file) => textOf(file).includes(module));
      return found.map((file) => ({ module, file }));
    });
    routes.push({ route, kb: Math.round(bytes / KB), budget, leaked });
  }
  routes.sort((a, b) => b.kb - a.kb);
  return routes;
}

export function violations(routes) {
  const overBudget = routes.filter((r) => r.kb > r.budget);
  const leaks = routes.filter((r) => r.leaked.length > 0);
  return { overBudget, leaks };
}

function main() {
  const distDir = process.env.NEXT_DIST_DIR ?? '.next';
  const routes = analyzeBundles(distDir);
  const { overBudget, leaks } = violations(routes);

  for (const r of routes) {
    const flag = r.leaked.length > 0 ? 'LEAK' : r.kb > r.budget ? 'OVER' : '  ok';
    console.log(`${flag}  ${String(r.kb).padStart(4)} kB / ${String(r.budget).padStart(4)} kB  ${r.route}`);
  }

  for (const r of leaks) {
    for (const { module, file } of r.leaked) {
      console.error(`\n✖ ${module} is in the initial bundle of ${r.route}\n    ${file}`);
    }
    console.error('  A value import pulls the whole library back in: import types only, or load it with import() (lib/supabase/browser-client.ts).');
  }
  for (const r of overBudget) {
    console.error(`\n✖ ${r.route} is ${r.kb - r.budget} kB over its ${r.budget} kB budget`);
  }

  if (leaks.length > 0 || overBudget.length > 0) {
    console.error(`\n${leaks.length + overBudget.length} route(s) failed. Fix the bundle, or raise the budget in ${import.meta.filename ?? 'scripts/check-bundles.mjs'} on purpose.`);
    process.exit(1);
  }
  console.log(`\n${routes.length} routes within budget, no lazy-only module in an initial bundle.`);
}

// pathToFileURL, not `file://${argv[1]}`: import.meta.url is percent-encoded,
// so in a checkout whose path has a space the comparison never matched and the
// script exited 0 without checking anything.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
