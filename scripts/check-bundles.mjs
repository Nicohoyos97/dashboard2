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
import zlib from 'node:zlib';

/** Modules that must stay out of every route's initial JavaScript. */
const MUST_BE_LAZY = ['recharts'];

/** Gzipped first-load ceilings in kB, by route as the build manifest names it. */
const BUDGETS = {
  '/[locale]/(auth)/invite/page': 245,
  '/[locale]/admin/(gated)/entities/[id]/page': 230,
  '/[locale]/admin/(gated)/clients/[id]/page': 228,
  '/[locale]/admin/(gated)/upload/page': 205,
  '/[locale]/(dashboard)/dashboard/page': 195,
  '/[locale]/(dashboard)/statements/balance-sheet/page': 195,
  '/[locale]/(dashboard)/statements/profit-and-loss/page': 195,
  '/[locale]/(dashboard)/expenses/page': 195,
  '/[locale]/(dashboard)/taxes/income/page': 172,
  '/[locale]/(dashboard)/taxes/sales/page': 170,
  '/[locale]/(dashboard)/chat/page': 158,
  '/[locale]/(dashboard)/reports/page': 135,
};

/** Anything without its own entry. Keeps new routes honest without listing them all. */
const DEFAULT_BUDGET = 200;

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
    // Layout entries share their chunks with the pages beneath them; the page
    // entry is what a visitor actually downloads first.
    if (!route.endsWith('/page')) continue;
    const js = files.filter((file) => file.endsWith('.js'));
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
    console.error('  A value import from a plot module pulls the whole library back in — import types only.');
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

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
