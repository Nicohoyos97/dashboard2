// @vitest-environment node
//
// The bundle guardrail, as a test. It needs a production build to inspect, so
// it skips when there is none — `pnpm check:bundles` after `next build` is the
// form that belongs in CI, and this is the form that catches a regression
// locally for anyone who has built recently.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { analyzeBundles, violations } from '../../scripts/check-bundles.mjs';

type Route = {
  route: string;
  kb: number;
  budget: number;
  leaked: { module: string; file: string }[];
};

const DIST = process.env.NEXT_DIST_DIR ?? '.next';
const built = fs.existsSync(path.join(DIST, 'app-build-manifest.json'));

describe.skipIf(!built)(`client bundles (${DIST})`, () => {
  const routes: Route[] = built ? analyzeBundles(DIST) : [];

  it('keeps Recharts out of every route\'s initial JavaScript', () => {
    // It got back in once: a wrapper imported a colour constant from the plot
    // module as a value, which pulls the library along with it.
    const leaks = routes.flatMap((r) => r.leaked.map((l) => `${l.module} in ${r.route}`));
    expect(leaks).toEqual([]);
  });

  it('keeps every route inside its first-load budget', () => {
    const over = violations(routes).overBudget.map(
      (r: Route) => `${r.route}: ${r.kb} kB > ${r.budget} kB`,
    );
    expect(over).toEqual([]);
  });

  it('actually inspected the routes it claims to guard', () => {
    // A guard that silently measures nothing is worse than no guard.
    expect(routes.length).toBeGreaterThan(20);
    expect(routes.some((r) => r.route.includes('dashboard/page'))).toBe(true);
  });
});
