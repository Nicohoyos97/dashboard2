import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// Tailwind v4 is CSS-first: tokens live in app/globals.css @theme. Guards against
// drift from INITIAL_PROMPT.md §6 (the primary design source) and against the v1
// palette creeping back in.
const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8');

describe('design tokens', () => {
  // Since the light/dark theme, the utilities point at theme variables; the
  // light values are still the §6 palette.
  it('defines the §6 palette (light theme) behind theme-aware utilities', () => {
    expect(css).toContain('--color-blue: var(--brand-primary)');
    expect(css).toContain('--color-blue-soft: var(--brand-primary-hover)');
    expect(css).toContain('--color-blue-pale: var(--brand-primary-soft)');
    expect(css).toContain('--color-paper: var(--page)');
    expect(css).toContain('--color-ink: var(--heading)');
    expect(css).toContain('--color-line: var(--border)');
    // Status hues became theme-aware in the Phase 6 accessibility pass: the
    // mint that reads on navy is 2.3:1 on white, and these are text as often as
    // fill. The light values below clear 4.5:1 on white, on --secondary and on
    // their own 10% tint (tests/e2e/accessibility.spec.ts checks it with axe).
    expect(css).toContain('--color-success: var(--success)');
    expect(css).toContain('--color-danger: var(--danger)');
    const light = css.slice(0, css.indexOf('\n.dark {'));
    expect(light).toContain('--success: #047857');
    expect(light).toContain('--warning: #92400e');
    expect(light).toContain('--danger: #b91c1c');
    // slate-500 (#64748b) is 4.34:1 on --secondary; muted text sits on it.
    expect(light).toContain('--muted-foreground: #5c6b7f');
    expect(light).toContain('--brand-primary: #2563eb');
    expect(light).toContain('--brand-primary-hover: #1d4ed8');
    expect(light).toContain('--brand-primary-soft: #eef5ff');
    expect(light).toContain('--page: #f7f9fc');
    expect(light).toContain('--heading: #0f172a');
    expect(light).toContain('--border: #e6ecf4');
    expect(light).toContain('--primary: #2563eb');
  });

  it('keeps a light status palette for dark surfaces', () => {
    const dark = css.slice(css.indexOf('\n.dark {'));
    expect(dark).toContain('--success: #34d399');
    expect(dark).toContain('--warning: #fbbf24');
    expect(dark).toContain('--danger: #f87171');
  });

  it('uses Inter as the single typeface', () => {
    expect(css).toContain('--font-sans: var(--font-inter)');
    expect(css).not.toMatch(/manrope|jakarta/i);
  });

  it('has no v1 palette leftovers', () => {
    expect(css).not.toContain('#003ec7');
    expect(css).not.toContain('--color-navy');
  });
});
