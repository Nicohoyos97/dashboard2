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
    expect(css).toContain('--color-success: #10b981');
    expect(css).toContain('--color-danger: #ef4444');
    const light = css.slice(0, css.indexOf('\n.dark {'));
    expect(light).toContain('--brand-primary: #2563eb');
    expect(light).toContain('--brand-primary-hover: #1d4ed8');
    expect(light).toContain('--brand-primary-soft: #eef5ff');
    expect(light).toContain('--page: #f7f9fc');
    expect(light).toContain('--heading: #0f172a');
    expect(light).toContain('--border: #e6ecf4');
    expect(light).toContain('--primary: #2563eb');
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
