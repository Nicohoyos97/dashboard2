import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// Tailwind v4 is CSS-first: tokens live in app/globals.css @theme. Guards against
// drift from INITIAL_PROMPT.md §6 (the primary design source) and against the v1
// palette creeping back in.
const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8');

describe('design tokens', () => {
  it('defines the §6 palette', () => {
    expect(css).toContain('--color-blue: #2563eb');
    expect(css).toContain('--color-blue-soft: #1d4ed8');
    expect(css).toContain('--color-blue-pale: #eef5ff');
    expect(css).toContain('--color-paper: #f7f9fc');
    expect(css).toContain('--color-ink: #0f172a');
    expect(css).toContain('--color-line: #e6ecf4');
    expect(css).toContain('--color-success: #10b981');
    expect(css).toContain('--color-danger: #ef4444');
    expect(css).toContain('--primary: #2563eb');
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
