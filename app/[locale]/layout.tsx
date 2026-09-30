// Locale layout: the document shell for every localized route. Sets <html lang>
// from the URL locale and provides translations to client components. Fonts and
// globals live one level up (app/).
import type { Metadata } from 'next';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';

import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { routing } from '@/i18n/routing';
import { THEME_INIT_SCRIPT } from '@/lib/theme/constants';

import { inter } from '../fonts';
import '../globals.css';

export const metadata: Metadata = {
  title: 'Hoyos Baker — Client Portal',
  description:
    'Secure client portal for bookkeeping & tax clients: financial statements, documents, and Nick, your AI financial assistant.',
  // The capybara. Served from public/ rather than the app/icon convention:
  // the root layout lives under [locale], and these paths are already outside
  // the i18n middleware's matcher. favicon.ico holds 16/32/48 for the tab;
  // the Apple icon sits on paper because iOS paints transparency black.
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/brand/icon.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: { url: '/brand/apple-icon.png', sizes: '180x180' },
  },
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  return (
    <html lang={locale} className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Inline in <head> so the theme class is set before first paint; next/script
            cannot be a direct child of <html> and triggered hydration errors. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <NextIntlClientProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
