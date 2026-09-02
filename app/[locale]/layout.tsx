// Locale layout: the document shell for every localized route. Sets <html lang>
// from the URL locale and provides translations to client components. Fonts and
// globals live one level up (app/).
import type { Metadata } from 'next';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';

import { routing } from '@/i18n/routing';

import { inter } from '../fonts';
import '../globals.css';

export const metadata: Metadata = {
  title: 'Hoyos Baker — Client Portal',
  description:
    'Secure client portal for bookkeeping & tax clients: financial statements, documents, and Nick, your AI financial assistant.',
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
    <html lang={locale} className={inter.variable}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
