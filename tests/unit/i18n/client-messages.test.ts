// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ADMIN_CLIENT_NAMESPACES, CLIENT_NAMESPACES, pickMessages } from '@/i18n/client-messages';

import en from '../../../messages/en.json';

// The providers send the browser only the namespaces listed in
// i18n/client-messages.ts. A client component reading a namespace that is not
// listed would print its keys instead of its words, and nothing else would
// notice — so every useTranslations('X') and every namespace="X" in the code
// is held against the lists here: the firm's files against the admin list,
// everything else against the shared one.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(path);
    return /\.(tsx?|mts)$/.test(name) ? [path] : [];
  });
}

const isAdmin = (path: string) => path.includes(join('components', 'admin')) || path.includes(join('[locale]', 'admin'));

const uses = ['app', 'components', 'lib'].flatMap(sourceFiles).flatMap((path) => {
  const text = readFileSync(path, 'utf8');
  const found = [...text.matchAll(/useTranslations\(\s*'([A-Za-z]+)/g), ...text.matchAll(/namespace="([A-Za-z]+)"/g)];
  return found.map((match) => ({ path, namespace: match[1] ?? '' }));
});

describe('the messages client components receive', () => {
  it('lists every namespace a client component reads', () => {
    expect(uses.length).toBeGreaterThan(20);
    const missing = uses.filter(({ path, namespace }) =>
      !(isAdmin(path) ? (ADMIN_CLIENT_NAMESPACES as readonly string[]) : (CLIENT_NAMESPACES as readonly string[])).includes(namespace),
    );
    expect(missing.map(({ path, namespace }) => `${namespace} in ${path}`)).toEqual([]);
  });

  it('keeps the firm namespace out of the client portal', () => {
    expect(CLIENT_NAMESPACES).not.toContain('Admin');
    expect(Object.keys(pickMessages(en, CLIENT_NAMESPACES))).not.toContain('Admin');
  });

  it('names only namespaces that exist', () => {
    expect(ADMIN_CLIENT_NAMESPACES.filter((namespace) => !(namespace in en))).toEqual([]);
  });
});
