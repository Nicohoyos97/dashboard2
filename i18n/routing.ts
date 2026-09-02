import { defineRouting } from 'next-intl/routing';

// English is the default and carries NO URL prefix; Spanish lives under /es.
// localeDetection is off by design — the locale travels from the marketing site
// in the URL, which is the single source of truth (see docs/DESIGN_SYSTEM.md /
// the i18n notes). No Accept-Language auto-redirect.
export const routing = defineRouting({
  locales: ['en', 'es'],
  defaultLocale: 'en',
  localePrefix: 'as-needed',
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
