// Which message namespaces reach the browser.
//
// NextIntlClientProvider with no `messages` serialises the whole catalogue into
// every page — ~19 kB gzipped in English, ~21 kB in Spanish, before a single
// figure. A client component only needs the namespaces it reads with
// useTranslations; everything a Server Component reads with getTranslations
// stays on the server. The firm's namespace (`Admin`, a third of the catalogue)
// goes only to /admin, whose layout provides its own list.
//
// A nested provider replaces its parent's messages rather than adding to them,
// so the admin list repeats the shared one. Adding useTranslations('X') to a
// client component means adding X here: tests/unit/i18n/client-messages.test.ts
// scans the code and fails until it is.
import type { AbstractIntlMessages } from 'next-intl';

export const CLIENT_NAMESPACES = [
  'Auth',
  'Expenses',
  'Ledger',
  'Mfa',
  'Nav',
  'Nick',
  'Notifications',
  'Overview',
  'Settings',
  'Shell',
  'Statements',
  'Taxes',
  'Theme',
] as const;

export const ADMIN_CLIENT_NAMESPACES = [...CLIENT_NAMESPACES, 'Admin'] as const;

export function pickMessages(messages: AbstractIntlMessages, namespaces: readonly string[]): AbstractIntlMessages {
  const picked: AbstractIntlMessages = {};
  for (const namespace of namespaces) {
    const value = messages[namespace];
    if (value !== undefined) picked[namespace] = value;
  }
  return picked;
}
