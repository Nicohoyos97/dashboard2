import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { FIRM } from '@/lib/reports/brand';

import { ThemeToggle } from '../theme/ThemeToggle';
import { TestimonialPanel } from './TestimonialPanel';

// Shared authentication shell: a 60% form column that blends into the page
// background and a 40% visual story hugging the right edge on larger screens.
// Below `lg` the visual is dropped entirely and the phone gets the form alone.
export function AuthSplit({ children }: { children: React.ReactNode }) {
  const t = useTranslations('Auth');
  return (
    <div className="bg-paper min-h-svh overflow-x-hidden lg:py-2 lg:pr-2">
      <main className="grid min-h-svh w-full grid-cols-1 lg:min-h-[calc(100svh-16px)] lg:grid-cols-[60fr_40fr] lg:gap-2">
        <section className="flex min-h-svh flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-10 lg:min-h-0 lg:px-12 lg:py-8 xl:px-16">
          <header className="flex items-center justify-between gap-3">
            {/* Out of the app and back to the marketing site, so it is a plain <a>:
                no locale prefix, no client router. The URL is the firm's, recorded
                once in `FIRM` — a second copy here is how the two would drift. */}
            <a
              href={FIRM.siteUrl}
              className="text-muted-foreground hover:text-blue focus-visible:ring-blue/35 -ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[14px] font-semibold transition-colors outline-none focus-visible:ring-3"
            >
              <ArrowLeft className="size-[18px]" aria-hidden="true" />
              {t('backToWebsite')}
            </a>
            <ThemeToggle compact />
          </header>

          <div className="flex flex-1 items-center py-12 sm:py-16 lg:py-10">
            <div className="mx-auto w-full max-w-[420px]">{children}</div>
          </div>
        </section>

        <TestimonialPanel />
      </main>
    </div>
  );
}
