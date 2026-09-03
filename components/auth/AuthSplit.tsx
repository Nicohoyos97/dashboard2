import Image from 'next/image';

import { Link } from '@/i18n/navigation';

import { ThemeToggle } from '../theme/ThemeToggle';
import { TestimonialPanel } from './TestimonialPanel';

// Shared authentication shell: a focused 44% form column and a 56% visual
// story on larger screens. On mobile the form remains first and the visual
// becomes a compact social-proof card below it.
export function AuthSplit({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-paper min-h-svh overflow-x-hidden lg:p-3">
      <main className="mx-auto grid min-h-svh w-full max-w-[1680px] grid-cols-1 lg:min-h-[calc(100svh-24px)] lg:grid-cols-[minmax(430px,44fr)_56fr] lg:gap-3">
        <section className="bg-card flex min-h-svh flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-10 lg:min-h-0 lg:rounded-[28px] lg:px-12 lg:py-8 xl:px-16">
          <header className="flex items-center justify-between gap-4">
            <Link
              href="/"
              aria-label="Hoyos Baker"
              className="focus-visible:ring-blue/40 inline-flex items-center gap-2.5 rounded-xl outline-none focus-visible:ring-3"
            >
              <Image
                src="/brand/logo-wordmark.png"
                alt=""
                width={44}
                height={44}
                priority
                className="size-11 rounded-full"
              />
              <span className="text-ink text-[15px] font-bold tracking-[-0.01em]">Hoyos Baker</span>
            </Link>
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
